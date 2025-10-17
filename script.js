// =======================================================
// 1. Supabase 配置 & 常量：请务必替换为您自己的密钥！
// =======================================================
// ⚠️ 替换为您自己的 Supabase URL 和 Anon Key
const SUPABASE_URL = 'https://cixxqwtkkrdpvagzkekj.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpeHhxd3Rra3JkcHZhZ3prZWtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMDA5MTQsImV4cCI6MjA3NTY3NjkxNH0.yF_ZOo1GTNJpesElxuKUJnNQnnpZzcYxpYn2A3B8vcE'; 
// 固定的默认图片 URL
const DEFAULT_IMAGE_URL = 'https://cixxqwtkkrdpvagzkekj.supabase.co/storage/v1/object/public/recipe_images/IMG_4157.JPG'; 

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const RECIPE_TABLE = 'recipes'; 
const BUCKET_NAME = 'recipe_images'; 

// 🚀 1. 更新：分类映射表 (添加 staple 和 other)
const CATEGORY_MAP = {
    'meat': '肉类',
    'seafood': '海鲜类',
    'vegetable': '蔬菜类',
    'staple': '主食', 
    'soup': '汤类', 
    'other': '其他', 
    'default': '未定义' 
};

// =======================================================
// 2. DOM 元素引用
// =======================================================
const navLinks = document.querySelectorAll('.nav-link');
const recipeCardsContainer = document.getElementById('recipe-cards-container');
const sortByControl = document.getElementById('sort-by'); 

// 🚀 核心筛选元素
const searchInput = document.getElementById('search-input');
const ratingFilter = document.getElementById('rating-filter'); 
// 🚀 2. 核心改动：多选筛选器现在是复选框组，DOM 引用不变
const categoryFilter = document.getElementById('category-filter');

// 新增模态框元素
const newRecipeModal = document.getElementById('new-recipe-modal');
const newRecipeCloseBtn = newRecipeModal ? newRecipeModal.querySelector('.new-recipe-close-btn') : null;
const newRecipeForm = document.getElementById('new-recipe-form');
const newRecipeRatingInput = document.getElementById('new-recipe-rating');
const saveRecipeBtn = document.getElementById('save-recipe-btn'); 
const uploadStatus = document.getElementById('upload-status'); 
const recipeImageFile = document.getElementById('recipe-image-file');

// 图片裁剪元素和实例
let cropper = null; 
const imageToCrop = document.getElementById('image-to-crop'); 
const imageCropArea = document.getElementById('image-crop-area');

// 编辑模态框元素
const editRecipeModal = document.getElementById('edit-recipe-modal');
const editRecipeCloseBtn = editRecipeModal ? editRecipeModal.querySelector('.edit-recipe-close-btn') : null;
const editRecipeForm = document.getElementById('edit-recipe-form');
const updateRecipeBtn = document.getElementById('update-recipe-btn');
const editUploadStatus = document.getElementById('edit-upload-status');
const editRecipeIdInput = document.getElementById('edit-recipe-id');
const editRecipeImageFile = document.getElementById('edit-recipe-image-file');
const editOldImageUrl = document.getElementById('edit-old-image-url');
const editCurrentImage = document.getElementById('edit-current-image'); 
const editImageToCrop = document.getElementById('edit-image-to-crop');
const editImageCropArea = document.getElementById('edit-image-crop-area');
let editCropper = null; 

// 菜单模态框元素
const generatorModal = document.getElementById('menu-generator-modal');
const menuDisplayModal = document.getElementById('menu-display-modal');
const generatedMenuUl = document.getElementById('generated-menu-ul');
const menuStatus = document.getElementById('menu-status');


// =======================================================
// 3. 核心功能函数
// =======================================================

/**
 * 获取当前激活的分类。
 */
function getCurrentCategory() {
    const activeLink = document.querySelector('.nav-link.active');
    return activeLink ? activeLink.dataset.category : 'all';
}

/**
 * 获取当前选定的排序方式。
 */
function getCurrentSort() {
    return sortByControl ? sortByControl.value : 'name';
}

// --- 星级评分视觉更新 (菜谱卡片内的评分组件) ---
function updateStarsVisual(container, rating) {
    container.querySelectorAll('i.far.fa-star').forEach(star => {
        const starValue = parseInt(star.dataset.value, 10);
        if (starValue <= rating) {
            star.classList.add('rated');
        } else {
            star.classList.remove('rated');
        }
    });
}

/**
 * 绑定星级评分的事件监听器，并处理数据库更新。
 */
function bindStarListeners(container, initialRating, recipeId) {
    const ratingInput = container.closest('.recipe-meta').querySelector('.current-rating');
    
    updateStarsVisual(container, initialRating);

    container.addEventListener('mouseover', (e) => {
        const star = e.target.closest('i.far.fa-star');
        if (star) {
            updateStarsVisual(container, parseInt(star.dataset.value, 10));
        }
    });
    container.addEventListener('mouseout', () => {
        updateStarsVisual(container, parseInt(ratingInput.value, 10));
    });

    container.addEventListener('click', async (e) => {
        const star = e.target.closest('i.far.fa-star');
        if (star) {
            const newRating = parseInt(star.dataset.value, 10);
            
            ratingInput.value = newRating;
            updateStarsVisual(container, newRating);
            
            const { error } = await supabase
                .from(RECIPE_TABLE)
                .update({ rating: newRating })
                .eq('id', recipeId); 

            if (error) {
                console.error('Supabase 评分更新失败:', error);
                alert('评分更新失败，请检查 Supabase UPDATE 策略！');
            } else {
                fetchAndRenderRecipes(getCurrentCategory(), getCurrentSort(), true); 
            }
        }
    });
}

// ------------------- Storage 操作 -------------------

async function deleteOldImage(imageUrl) {
    if (!imageUrl || imageUrl === DEFAULT_IMAGE_URL || imageUrl.includes('placeholder')) return; 

    const pathParts = new URL(imageUrl).pathname.split('/');
    const fileName = pathParts[pathParts.length - 1];

    if (!fileName) return;

    const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([fileName]);

    if (error) {
        console.warn('删除旧图片失败 (Storage Policy RLS 或文件不存在):', error);
    } else {
        console.log(`旧图片 "${fileName}" 删除成功。`);
    }
}

/**
 * 通用的图片上传函数，支持 File 对象或 Blob 对象 (裁剪后)
 */
async function uploadRecipeImage(fileOrBlob, statusElement, saveButton) {
    if (!fileOrBlob) return null;

    saveButton.disabled = true;
    statusElement.textContent = '图片上传中...';

    let fileName, fileType;
    if (fileOrBlob instanceof File) {
        const fileExtension = fileOrBlob.name.split('.').pop();
        fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
        fileType = fileOrBlob.type;
    } else { 
        const extension = fileOrBlob.type.split('/')[1] || 'jpeg';
        fileName = `cropped-${Date.now()}-${Math.random().toString(36).substring(2)}.${extension}`;
        fileType = fileOrBlob.type;
    }

    const filePath = `${fileName}`; 
    
    const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, fileOrBlob, {
            contentType: fileType, 
            cacheControl: '3600',
            upsert: false
        });

    saveButton.disabled = false;
    statusElement.textContent = '';

    if (error) {
        console.error('图片上传失败:', error);
        alert(`图片上传失败: ${error.message}。请检查您的 Supabase Storage INSERT Policy！`);
        return null;
    }

    const { data: publicURLData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

    return publicURLData.publicUrl;
}

// ------------------- CRUD/渲染操作 -------------------
function createRecipeCard(recipe) {
    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.dataset.recipeId = recipe.id;
    // 菜谱卡片现在的数据属性是数组，用于客户端筛选，但通常不需要
    // card.dataset.category = recipe.category;

    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
        starsHtml += `<i class="far fa-star" data-value="${i}"></i>`;
    }
    
    const actionButtons = `
        <div class="recipe-actions">
            <button class="action-btn edit-btn" data-id="${recipe.id}"><i class="fas fa-edit"></i></button>
            <button class="action-btn delete-btn" data-id="${recipe.id}"><i class="fas fa-trash-alt"></i></button>
        </div>
    `;
    
    const ingredientsText = recipe.ingredients || '暂无食材信息';
    
    // 🚀 3. 核心更新：处理多选分类显示
    let categoriesHtml = '<span><i class="fas fa-tag"></i> ';
    if (Array.isArray(recipe.category)) {
        // 将分类数组转换为中文标签字符串
        const translatedCategories = recipe.category
            .map(cat => CATEGORY_MAP[cat] || CATEGORY_MAP.default)
            .join(' / ');
        categoriesHtml += translatedCategories;
    } else {
        // 兼容旧数据 (如果 category 仍然是字符串)
        categoriesHtml += CATEGORY_MAP[recipe.category] || CATEGORY_MAP.default;
    }
    categoriesHtml += '</span>';


    card.innerHTML = `
        ${actionButtons}
        <img src="${recipe.image_url || 'https://via.placeholder.com/220x220?text=No+Image'}" alt="${recipe.name}图片" class="recipe-image">
        <div class="recipe-info">
            <h3 class="recipe-title">
                <a href="${recipe.tutorial_url || '#'}" target="_blank">${recipe.name}</a> 
            </h3>
            
            <p class="recipe-ingredients">
                <i class="fas fa-carrot"></i> ${ingredientsText}
            </p>
            
            <p class="recipe-meta">
                ${categoriesHtml}
                <span class="rating-container">
                    ${starsHtml}
                </span>
                <input type="hidden" class="current-rating" value="${recipe.rating}">
            </p>
        </div>
    `;

    const ratingContainer = card.querySelector('.rating-container');
    bindStarListeners(ratingContainer, recipe.rating, recipe.id);
    
    return card;
}

/**
 * 核心函数：根据筛选条件拉取并渲染菜谱
 */
async function fetchAndRenderRecipes(selectedNavCategory = 'all', sortBy = 'name', restoreScroll = false) {
    if (!recipeCardsContainer) return; 

    // 1. 获取筛选值
    const currentSearchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const currentExactRating = ratingFilter ? parseInt(ratingFilter.value, 10) : 0; 
    
    // 🚀 4. 核心改动：获取多选筛选栏选中的值 (Category Filter 现在是 Select)
    let selectedFilterCategories = [];
    if (categoryFilter) {
        // **注意：这里假设 ID 为 'category-filter' 的元素仍然是一个 <select multiple>**
        selectedFilterCategories = Array.from(categoryFilter.selectedOptions).map(option => option.value);
    }
    
    // 2. 保存当前滚动位置
    let scrollPosition = 0;
    if (restoreScroll) {
        scrollPosition = window.scrollY;
    }

    recipeCardsContainer.innerHTML = '<h2>加载中...</h2>'; 

    let query = supabase.from(RECIPE_TABLE).select('*');
    
    // 3. Supabase 筛选逻辑 (分类)
    let categoriesToFilter = [];

    // 优先使用左侧导航栏的单选分类
    if (selectedNavCategory !== 'all') {
        // 导航栏是单选，只筛选一个分类
        categoriesToFilter.push(selectedNavCategory);
    } else if (selectedFilterCategories.length > 0) {
        // 如果导航栏是 'all'，则使用多选筛选栏的集合
        categoriesToFilter = selectedFilterCategories;
    }
    
    if (categoriesToFilter.length > 0) {
        // 🚨 核心更新：使用 .overlaps 来查询数组字段
        query = query.overlaps('category', categoriesToFilter);
    }
    
    // 4. Supabase 筛选逻辑 (星级)
    if (currentExactRating > 0 && currentExactRating <= 5) {
        query = query.eq('rating', currentExactRating);
    }

    // 5. 排序逻辑
    if (sortBy === 'rating_desc') {
        query = query.order('rating', { ascending: false }).order('name', { ascending: true });
    } else {
         query = query.order('name', { ascending: true });
    }

    const { data: recipes, error } = await query;

    if (error) {
        console.error('获取菜谱失败:', error);
        recipeCardsContainer.innerHTML = '<h2>加载菜谱失败。请检查 Supabase 配置和 SELECT 策略。</h2>';
        return;
    }
    
    // 6. 客户端搜索过滤 (不变)
    let filteredRecipes = recipes;
    if (currentSearchTerm) {
        if (Array.isArray(recipes)) {
            filteredRecipes = recipes.filter(recipe => 
                recipe.name && recipe.name.toLowerCase().includes(currentSearchTerm)
            );
        } else {
             filteredRecipes = [];
        }
    }
    
    recipeCardsContainer.innerHTML = ''; 
    filteredRecipes.forEach(recipe => {
        recipeCardsContainer.appendChild(createRecipeCard(recipe));
    });

    if (filteredRecipes.length === 0) {
        if (recipes.length === 0 && !currentSearchTerm && selectedNavCategory === 'all' && categoriesToFilter.length === 0 && currentExactRating === 0) {
             recipeCardsContainer.innerHTML = '<h2>数据库中暂无菜谱记录。</h2>';
        } else {
             recipeCardsContainer.innerHTML = '<h2>未找到符合筛选条件的菜谱。</h2>';
        }
    }

    // 7. 恢复滚动位置
    if (restoreScroll) {
        window.scrollTo(0, scrollPosition);
    }
}

async function deleteRecipe(recipeId, recipeName) {
    if (!confirm(`确定要删除菜谱 "${recipeName}" 吗？此操作不可逆！`)) {
        return;
    }

    const { data: recipe, error: fetchError } = await supabase
        .from(RECIPE_TABLE)
        .select('image_url')
        .eq('id', recipeId)
        .single();
    
    if (fetchError && fetchError.code !== 'PGRST116') { 
        console.error('删除前获取菜谱失败:', fetchError);
        alert('删除失败，无法获取菜谱信息。');
        return;
    }

    const { error: deleteError } = await supabase
        .from(RECIPE_TABLE)
        .delete()
        .eq('id', recipeId);

    if (deleteError) {
        console.error('Supabase 删除失败:', deleteError);
        alert('菜谱删除失败！请检查您的 Supabase DELETE RLS 策略！'); 
    } else {
        alert(`菜谱 "${recipeName}" 删除成功！`);
        
        if (recipe && recipe.image_url) {
            await deleteOldImage(recipe.image_url);
        }
        
        fetchAndRenderRecipes(getCurrentCategory(), getCurrentSort(), true);
    }
}

async function openEditModal(recipeId) {
    const { data: recipe, error } = await supabase
        .from(RECIPE_TABLE)
        .select('*')
        .eq('id', recipeId)
        .single();

    if (error) {
        console.error('获取菜谱数据失败:', error);
        alert('加载菜谱数据失败。');
        return;
    }

    document.getElementById('edit-recipe-name').value = recipe.name;
    document.getElementById('edit-recipe-tutorial').value = recipe.tutorial_url || '';
    editRecipeIdInput.value = recipe.id;
    editOldImageUrl.value = recipe.image_url || ''; 
    
    // 填充食材信息
    const editIngredientsInput = document.getElementById('edit-recipe-ingredients');
    if (editIngredientsInput) {
        editIngredientsInput.value = recipe.ingredients || '';
    }

    // 🚀 5. 核心改动：填充复选框组的逻辑
    const editCategoryCheckboxes = document.querySelectorAll('#edit-recipe-category-checkboxes input[name="edit-category"]');
    
    // 1. 重置所有选项为未选中（清除上一次编辑的残留状态）
    editCategoryCheckboxes.forEach(cb => {
        cb.checked = false;
    });

    // 2. 选中已保存的分类 (recipe.category 字段现在是数组/jsonb)
    if (Array.isArray(recipe.category)) {
        // 遍历数据库返回的已选分类数组
        recipe.category.forEach(cat => {
            // 根据分类值 (cat) 找到对应的复选框并设为选中
            const checkbox = document.querySelector(`#edit-recipe-category-checkboxes input[value="${cat}"]`);
            if (checkbox) {
                checkbox.checked = true; // 🚨 关键：设为选中状态
            }
        });
    }
    // 兼容旧数据 (如果 category 仍然是单个字符串)
    else if (typeof recipe.category === 'string' && recipe.category) {
        const checkbox = document.querySelector(`#edit-recipe-category-checkboxes input[value="${recipe.category}"]`);
        if (checkbox) {
            checkbox.checked = true;
        }
    }


    if (editCurrentImage) {
        editCurrentImage.src = recipe.image_url || 'https://via.placeholder.com/180x180?text=No+Image';
        editCurrentImage.style.display = 'block'; 
    }

    editRecipeImageFile.value = '';
    
    if (editCropper) editCropper.destroy();
    editCropper = null;
    if(editImageCropArea) editImageCropArea.style.display = 'none';

    if(editRecipeModal) editRecipeModal.style.display = 'block';
}

async function handleEditFormSubmit(e) {
    e.preventDefault();

    const recipeId = editRecipeIdInput.value;
    const oldImageUrl = editOldImageUrl.value;
    const originalFile = editRecipeImageFile.files[0];
    
    const editIngredientsInput = document.getElementById('edit-recipe-ingredients');
    
    // 🚀 6. 核心改动：获取复选框的值并保存为数组
    const categoryCheckboxes = document.querySelectorAll('#edit-recipe-category-checkboxes input[name="edit-category"]:checked');
    const categories = Array.from(categoryCheckboxes).map(cb => cb.value);
    
    if (categories.length === 0) {
        alert("请至少选择一个菜品种类！");
        // 触发隐藏字段的required验证
        document.getElementById('edit-category-validation-input').reportValidity(); 
        return;
    }

    const updatedData = {
        name: document.getElementById('edit-recipe-name').value.trim(),
        category: categories, // 🚨 关键：保存为数组 (jsonb/text[])
        tutorial_url: document.getElementById('edit-recipe-tutorial').value.trim() || null,
        ingredients: editIngredientsInput ? editIngredientsInput.value.trim() || null : null 
    };

    let newImageUrl = oldImageUrl; 
    let fileToUpload = null;
    
    // 1. 处理裁剪逻辑
    if (editCropper && originalFile) {
        editUploadStatus.textContent = '正在处理图片...';
        
        fileToUpload = await new Promise((resolve) => {
            editCropper.getCroppedCanvas({
                width: 440, 
                height: 440,
            }).toBlob((blob) => {
                resolve(blob);
            }, originalFile.type, 0.9); 
        });

    } else if (originalFile) {
        fileToUpload = originalFile;
    }

    // 2. 上传文件/Blob
    if (fileToUpload) {
        const uploadedUrl = await uploadRecipeImage(fileToUpload, editUploadStatus, updateRecipeBtn);
        
        if (!uploadedUrl) {
            return; 
        }
        
        newImageUrl = uploadedUrl;
        
        if (oldImageUrl !== DEFAULT_IMAGE_URL) {
            await deleteOldImage(oldImageUrl); 
        }
        
        if (editCropper) editCropper.destroy();
        editCropper = null;
        if(editImageCropArea) editImageCropArea.style.display = 'none';
        editRecipeImageFile.value = '';
    }

    updatedData.image_url = newImageUrl;

    // 3. 更新数据库
    const { error } = await supabase
        .from(RECIPE_TABLE)
        .update(updatedData)
        .eq('id', recipeId);

    if (error) {
        console.error('Supabase 更新失败:', error);
        alert('菜谱更新失败！请检查您的 Supabase UPDATE RLS 策略！');
    } else {
        alert(`菜谱 "${updatedData.name}" 修改成功！`);
        if(editRecipeModal) editRecipeModal.style.display = 'none';
        fetchAndRenderRecipes(getCurrentCategory(), getCurrentSort(), true); 
    }
}

// ------------------- 新增表单提交 -------------------
async function handleNewFormSubmit(e) {
    e.preventDefault();
        
    const recipeName = document.getElementById('recipe-name').value.trim();
    const recipeTutorial = document.getElementById('recipe-tutorial').value.trim();
    const initialRating = parseInt(newRecipeRatingInput.value, 10);
    const recipeIngredients = document.getElementById('recipe-ingredients').value.trim();

    // 🚀 7. 核心改动：读取复选框组
    const categoryCheckboxes = document.querySelectorAll('#recipe-category-checkboxes input[name="category"]:checked');
    const categories = Array.from(categoryCheckboxes).map(cb => cb.value);

    // 确保至少选中一个
    if (categories.length === 0) {
        alert("请至少选择一个菜品种类！");
        // 触发隐藏字段的required验证
        document.getElementById('category-validation-input').reportValidity(); 
        return;
    }

    const originalFile = recipeImageFile.files[0]; 
    let imageUrl = DEFAULT_IMAGE_URL; 
    let fileToUpload = null;
    
    // --- 裁剪和上传逻辑 ---
    if (cropper && originalFile) {
        uploadStatus.textContent = '正在处理图片...';
        
        fileToUpload = await new Promise((resolve) => {
            cropper.getCroppedCanvas({
                width: 440, 
                height: 440,
            }).toBlob((blob) => {
                resolve(blob);
            }, originalFile.type, 0.9); 
        });

    } else if (originalFile) {
        fileToUpload = originalFile;
    }
    
    if (fileToUpload) {
        const uploadedUrl = await uploadRecipeImage(fileToUpload, uploadStatus, saveRecipeBtn);
        if (!uploadedUrl) {
            return; 
        }
        imageUrl = uploadedUrl;
    }
    
    // --- 提交数据库 ---
    const newRecipe = {
        name: recipeName,
        category: categories, // 🚨 关键：保存为数组
        tutorial_url: recipeTutorial || null,
        rating: initialRating,
        ingredients: recipeIngredients || null,
        image_url: imageUrl
    };

    const { error } = await supabase
        .from(RECIPE_TABLE)
        .insert([newRecipe]);

    if (error) {
        console.error('Supabase 插入失败:', error);
        alert('新增菜谱失败！请检查您的 Supabase INSERT RLS 策略！');
    } else {
        alert(`菜谱 "${recipeName}" 新增成功！`);
        if(newRecipeModal) newRecipeModal.style.display = 'none';
        
        if (cropper) cropper.destroy();
        cropper = null;
        if(imageCropArea) imageCropArea.style.display = 'none';
        
        newRecipeForm.reset();
        fetchAndRenderRecipes(getCurrentCategory(), getCurrentSort());
    }
}


// ------------------- 菜单生成 -------------------

function getRandomItems(arr, n) { 
    if (n >= arr.length) return arr;
    const shuffled = arr.slice(0);
    let i = arr.length, temp, index;
    while (i--) {
        index = Math.floor((i + 1) * Math.random());
        temp = shuffled[index];
        shuffled[index] = shuffled[i];
        shuffled[i] = temp;
    }
    return shuffled.slice(0, n);
}

async function generateRandomMenu(options) {
    const { data: allRecipes, error } = await supabase.from(RECIPE_TABLE).select('*');
    if (error) {
        if(menuStatus) menuStatus.textContent = '菜单生成失败：无法连接数据库。';
        if(menuDisplayModal) menuDisplayModal.style.display = 'block';
        return;
    }

    // 清除上一次生成的食材清单
    const menuListContainer = generatedMenuUl ? generatedMenuUl.parentNode : null;
    if (menuListContainer) {
        menuListContainer.querySelectorAll('.shopping-list-header, .shopping-list-content').forEach(el => {
            el.remove();
        });
    }

    let selectedRecipes = [];
    if(menuStatus) menuStatus.textContent = '';
    
    // 🚀 8. 菜单生成逻辑保持不变，因为它是基于 input value 的，不依赖于 select/checkbox 的 DOM 结构
    const meatCount = parseInt(options.meatCount);
    const seafoodCount = parseInt(options.seafoodCount);
    const vegCount = parseInt(options.vegCount);
    const stapleCount = parseInt(options.stapleCount); 
    const soupCount = parseInt(options.soupCount); 
    const totalCount = parseInt(options.totalCount);
    
    // 检查是否启用分类模式
    const categoryTotal = meatCount + seafoodCount + vegCount + stapleCount + soupCount;
    const isCategoryMode = categoryTotal > 0; 

    if (isCategoryMode) {
        // 🚨 菜谱过滤必须使用 .some()，因为菜谱的 category 字段现在是数组 (保持不变)
        const meatRecipes = allRecipes.filter(r => Array.isArray(r.category) && r.category.includes('meat'));
        const seafoodRecipes = allRecipes.filter(r => Array.isArray(r.category) && r.category.includes('seafood'));
        const vegRecipes = allRecipes.filter(r => Array.isArray(r.category) && r.category.includes('vegetable'));
        const stapleRecipes = allRecipes.filter(r => Array.isArray(r.category) && r.category.includes('staple')); 
        const soupRecipes = allRecipes.filter(r => Array.isArray(r.category) && r.category.includes('soup')); 
        
        selectedRecipes = [
            ...getRandomItems(meatRecipes, meatCount),
            ...getRandomItems(seafoodRecipes, seafoodCount),
            ...getRandomItems(vegRecipes, vegCount),
            ...getRandomItems(stapleRecipes, stapleCount), // 新增
            ...getRandomItems(soupRecipes, soupCount) // 新增
        ];
        
        let missingCount = 0;
        missingCount += (meatCount > meatRecipes.length ? meatCount - meatRecipes.length : 0);
        missingCount += (seafoodCount > seafoodRecipes.length ? seafoodCount - seafoodRecipes.length : 0);
        missingCount += (vegCount > vegRecipes.length ? vegCount - vegRecipes.length : 0);
        missingCount += (stapleCount > stapleRecipes.length ? stapleCount - stapleRecipes.length : 0); // 新增
        missingCount += (soupCount > soupRecipes.length ? soupCount - soupRecipes.length : 0); // 新增
        
        if (missingCount > 0 && menuStatus) {
             menuStatus.textContent = `注意：有 ${missingCount} 道菜品因库存不足，未能按要求生成。`;
        }

    } else {
        if (allRecipes.length < totalCount && menuStatus) {
            menuStatus.textContent = `注意：菜品总数不足 ${totalCount} 道，已返回全部 ${allRecipes.length} 道菜。`;
        }
        selectedRecipes = getRandomItems(allRecipes, totalCount);
    }
    
    
    const ingredientList = new Set();

    if (selectedRecipes.length === 0) {
        if(generatedMenuUl) generatedMenuUl.innerHTML = '<li>未找到符合要求的菜谱。请调整生成数量。</li>';
    } else {
        
        // 1. 遍历选定的菜谱，收集所有食材 (去重)
        selectedRecipes.forEach(recipe => {
            const recipeIngredients = recipe.ingredients; 
            if (recipeIngredients) {
                recipeIngredients.split(/[,\uff0c;；]/) 
                                 .map(item => item.trim())
                                 .filter(item => item.length > 0) 
                                 .forEach(item => ingredientList.add(item));
            }
        });
        
        // 2. 渲染菜品列表
        if(generatedMenuUl) generatedMenuUl.innerHTML = '';
        selectedRecipes.forEach(recipe => {
            const li = document.createElement('li');
            
            // 🚨 关键：获取第一个分类作为菜单显示的主要分类 (如果存在)
            const primaryCategory = Array.isArray(recipe.category) ? recipe.category[0] : recipe.category;
            const translatedCategory = CATEGORY_MAP[primaryCategory] || CATEGORY_MAP.default;
            
            let starRatingHtml = '<span style="font-size: 0.9em; margin-left: 10px; color: #f39c12;">';
            for (let i = 1; i <= 5; i++) {
                starRatingHtml += (i <= recipe.rating) ? '<i class="fas fa-star"></i>' : '<i class="far fa-star" style="color: #ccc;"></i>'; 
            }
            starRatingHtml += '</span>';

            li.innerHTML = `
                <a href="${recipe.tutorial_url}" target="_blank">
                    ${recipe.name} (${translatedCategory})
                </a>
                ${starRatingHtml}
            `;
            if(generatedMenuUl) generatedMenuUl.appendChild(li);
        });
        
        // 3. 渲染食材清单
        const shoppingListHeader = document.createElement('h3');
        shoppingListHeader.className = 'shopping-list-header'; 
        shoppingListHeader.style.cssText = 'margin-top: 30px; margin-bottom: 15px; color: var(--primary-color); font-size: 1.2em; border-top: 1px solid var(--border-color); padding-top: 15px;';
        shoppingListHeader.innerHTML = '<i class="fas fa-shopping-basket"></i> **所需食材清单 (不重复):**';
        
        const shoppingListP = document.createElement('p');
        shoppingListP.className = 'shopping-list-content'; 
        shoppingListP.style.cssText = 'line-height: 1.8; color: var(--dark-text); padding: 10px; background-color: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px;';
        
        if (ingredientList.size > 0) {
            shoppingListP.textContent = Array.from(ingredientList).join('， ');
        } else {
            shoppingListP.textContent = '此菜单中所有菜品均未填写所需食材。';
        }
        
        if(generatedMenuUl) generatedMenuUl.parentNode.insertBefore(shoppingListP, generatedMenuUl.nextSibling);
        if(generatedMenuUl) generatedMenuUl.parentNode.insertBefore(shoppingListHeader, shoppingListP);

    }

    if(menuDisplayModal) menuDisplayModal.style.display = 'block';
}

// =======================================================
// 4. 事件监听器 (程序入口)
// =======================================================
document.addEventListener('DOMContentLoaded', () => {
    
    if (newRecipeModal) {
        fetchAndRenderRecipes(getCurrentCategory(), getCurrentSort()); 
    }
    
    // --- 导航栏监听 (单选分类) ---
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault(); 
            navLinks.forEach(item => item.classList.remove('active'));
            link.classList.add('active');
            // 清空多选筛选器 (仍然是 <select multiple>，如果用户未修改 HTML)
            if(categoryFilter) Array.from(categoryFilter.options).forEach(option => option.selected = false);
            fetchAndRenderRecipes(link.dataset.category, getCurrentSort()); 
        });
    });

    // 🚀 9. 筛选栏监听 (保持不变，因为 'category-filter' 仍然是 <select multiple>)
    if (categoryFilter) {
        categoryFilter.addEventListener('change', () => {
            // 清空导航栏的激活状态
            navLinks.forEach(item => item.classList.remove('active'));
            document.querySelector('.nav-link[data-category="all"]').classList.add('active');
            
            // fetchAndRenderRecipes 会自动读取 categoryFilter 的值进行筛选
            fetchAndRenderRecipes('all', getCurrentSort()); 
        });
    }

    if (sortByControl) {
        sortByControl.addEventListener('change', () => {
            fetchAndRenderRecipes(getCurrentCategory(), getCurrentSort()); 
        });
    }
    
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            fetchAndRenderRecipes(getCurrentCategory(), getCurrentSort(), false); 
        });
    }

    if (ratingFilter) {
        ratingFilter.addEventListener('change', () => {
            fetchAndRenderRecipes(getCurrentCategory(), getCurrentSort());
        });
    }
    
    // --- 卡片动作 (编辑/删除) 委托 ---
    if (recipeCardsContainer) {
        recipeCardsContainer.addEventListener('click', (e) => {
            const button = e.target.closest('.action-btn');
            if (button) {
                const recipeId = button.dataset.id;
                
                if (button.classList.contains('edit-btn')) {
                    openEditModal(recipeId);
                } else if (button.classList.contains('delete-btn')) {
                    const recipeCard = button.closest('.recipe-card');
                    const recipeNameElement = recipeCard ? recipeCard.querySelector('.recipe-title a') : null;
                    const recipeName = recipeNameElement ? recipeNameElement.textContent : '未知菜谱';
                    deleteRecipe(recipeId, recipeName);
                }
            }
        });
    }

    // --- 模态框开关事件 ---
    const addRecipeBtn = document.getElementById('add-recipe-btn');
    if(addRecipeBtn) addRecipeBtn.onclick = () => { 
        if(newRecipeModal) newRecipeModal.style.display = 'block'; 
        // 🚀 10. 核心改动：打开新增模态框时，清除所有复选框的选中状态
        document.querySelectorAll('#recipe-category-checkboxes input[name="category"]').forEach(cb => {
            cb.checked = false;
        });
    };
    if(newRecipeCloseBtn) newRecipeCloseBtn.onclick = () => { 
        if(newRecipeModal) newRecipeModal.style.display = 'none'; 
        if (cropper) cropper.destroy();
        cropper = null;
        if(imageCropArea) imageCropArea.style.display = 'none';
        newRecipeForm.reset();
    };

    if(editRecipeCloseBtn) editRecipeCloseBtn.onclick = () => { 
        if(editRecipeModal) editRecipeModal.style.display = 'none'; 
        if (editCropper) editCropper.destroy();
        editCropper = null;
        if(editImageCropArea) editImageCropArea.style.display = 'none';
        if(editCurrentImage) editCurrentImage.style.display = 'block';
    };
    if(editRecipeForm) editRecipeForm.addEventListener('submit', handleEditFormSubmit);
    // 🚀 11. 绑定新增菜谱的提交事件 (保持不变，但逻辑已更新)
    if(newRecipeForm) newRecipeForm.addEventListener('submit', handleNewFormSubmit);


    // --- 菜单生成模态框事件 ---
    const generateMenuBtn = document.getElementById('generate-menu-btn');
    if(generateMenuBtn) generateMenuBtn.onclick = () => { if(generatorModal) generatorModal.style.display = 'block'; };
    
    const generatorCloseBtn = generatorModal ? generatorModal.querySelector('.generate-close-btn') : null;
    if(generatorCloseBtn) generatorCloseBtn.onclick = () => { if(generatorModal) generatorModal.style.display = 'none'; };

    const displayCloseBtn = menuDisplayModal ? menuDisplayModal.querySelector('.display-close-btn') : null;
    if(displayCloseBtn) displayCloseBtn.onclick = () => { if(menuDisplayModal) menuDisplayModal.style.display = 'none'; };
});
