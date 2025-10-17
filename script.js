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

// 分类映射表
const CATEGORY_MAP = {
    'meat': '肉类',
    'seafood': '海鲜类',
    'vegetable': '蔬菜类',
    'default': '其他/未定义' 
};

// =======================================================
// 2. DOM 元素引用
// =======================================================
const navLinks = document.querySelectorAll('.nav-link');
const recipeCardsContainer = document.getElementById('recipe-cards-container');
const sortByControl = document.getElementById('sort-by'); 

// 新增模态框元素
const newRecipeModal = document.getElementById('new-recipe-modal');
const newRecipeCloseBtn = newRecipeModal ? newRecipeModal.querySelector('.new-recipe-close-btn') : null;
const newRecipeForm = document.getElementById('new-recipe-form');
const newRecipeRatingInput = document.getElementById('new-recipe-rating');
const saveRecipeBtn = document.getElementById('save-recipe-btn'); 
const uploadStatus = document.getElementById('upload-status'); 
const recipeImageFile = document.getElementById('recipe-image-file');

// 🚀 图片裁剪元素和实例 (新增)
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
// 🚀 新增编辑菜谱的 Cropper 变量
const editImageToCrop = document.getElementById('edit-image-to-crop');
const editImageCropArea = document.getElementById('edit-image-crop-area');
let editCropper = null; // 编辑模态框专用的 Cropper 实例

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

// --- 星级评分视觉更新 ---
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
    // 如果是默认图片或占位图片，则不删除
    if (!imageUrl || imageUrl === DEFAULT_IMAGE_URL || imageUrl.includes('placeholder')) return; 

    // 提取文件名
    const pathParts = new URL(imageUrl).pathname.split('/');
    const fileName = pathParts[pathParts.length - 1];

    if (!fileName) return;

    const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([fileName]);

    if (error) {
        console.error('删除旧图片失败 (Storage Policy RLS):', error);
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

    // 确定文件名和 MIME 类型
    // 如果是 File 对象，使用其 name 和 type；如果是 Blob，需要自定义名称
    let fileName, fileType;
    if (fileOrBlob instanceof File) {
        const fileExtension = fileOrBlob.name.split('.').pop();
        fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
        fileType = fileOrBlob.type;
    } else { // 假定是裁剪后的 Blob
        // Blob 对象的 type 可能不完整，这里假设它应该匹配一个常见的图片类型
        // 如果是 toBlob 导出，type 可能是 'image/jpeg'
        const extension = fileOrBlob.type.split('/')[1] || 'jpeg';
        fileName = `cropped-${Date.now()}-${Math.random().toString(36).substring(2)}.${extension}`;
        fileType = fileOrBlob.type;
    }

    const filePath = `${fileName}`; 
    
    // 使用 fileOrBlob 进行上传
    const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, fileOrBlob, {
            contentType: fileType, // 确保设置了正确的 Content-Type
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
    card.dataset.category = recipe.category;

    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
        starsHtml += `<i class="far fa-star" data-value="${i}"></i>`;
    }
    
    // 确保按钮上带有 edit-btn 和 delete-btn 类名，方便事件委托
    const actionButtons = `
        <div class="recipe-actions">
            <button class="action-btn edit-btn" data-id="${recipe.id}"><i class="fas fa-edit"></i></button>
            <button class="action-btn delete-btn" data-id="${recipe.id}"><i class="fas fa-trash-alt"></i></button>
        </div>
    `;
    
    // 食材显示
    const ingredientsText = recipe.ingredients || '暂无食材信息';

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
                <span><i class="fas fa-tag"></i> ${CATEGORY_MAP[recipe.category] || CATEGORY_MAP.default}</span>
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
 * 核心函数：根据分类和排序方式拉取并渲染菜谱 (带滚动恢复)
 */
async function fetchAndRenderRecipes(category = 'all', sortBy = 'name', restoreScroll = false) {
    if (!recipeCardsContainer) return; 

    // 1. 保存当前滚动位置 (如果需要恢复)
    let scrollPosition = 0;
    if (restoreScroll) {
        scrollPosition = window.scrollY;
    }

    recipeCardsContainer.innerHTML = '<h2>加载中...</h2>'; 

    let query = supabase.from(RECIPE_TABLE).select('*');

    // 2. 筛选逻辑
    if (category !== 'all') {
        query = query.eq('category', category); 
    }

    // 3. 排序逻辑
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
    
    recipeCardsContainer.innerHTML = ''; 
    recipes.forEach(recipe => {
        recipeCardsContainer.appendChild(createRecipeCard(recipe));
    });

    if (recipes.length === 0) {
        recipeCardsContainer.innerHTML = '<h2>未找到菜谱。请尝试新增菜谱！</h2>';
    }

    // 4. 恢复滚动位置
    if (restoreScroll) {
        window.scrollTo(0, scrollPosition);
    }
}

async function deleteRecipe(recipeId, recipeName) {
    if (!confirm(`确定要删除菜谱 "${recipeName}" 吗？此操作不可逆！`)) {
        return;
    }

    // 1. 获取图片 URL
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

    // 2. 删除数据库记录
    const { error: deleteError } = await supabase
        .from(RECIPE_TABLE)
        .delete()
        .eq('id', recipeId);

    if (deleteError) {
        console.error('Supabase 删除失败:', deleteError);
        alert('菜谱删除失败！请检查您的 Supabase DELETE RLS 策略！'); 
    } else {
        alert(`菜谱 "${recipeName}" 删除成功！`);
        
        // 3. (可选) 删除 Storage 中的图片
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
    document.getElementById('edit-recipe-category').value = recipe.category;
    document.getElementById('edit-recipe-tutorial').value = recipe.tutorial_url || '';
    editRecipeIdInput.value = recipe.id;
    editOldImageUrl.value = recipe.image_url || ''; 
    
    // 填充食材信息
    const editIngredientsInput = document.getElementById('edit-recipe-ingredients');
    if (editIngredientsInput) {
        editIngredientsInput.value = recipe.ingredients || '';
    }

    if (editCurrentImage) {
        editCurrentImage.src = recipe.image_url || 'https://via.placeholder.com/180x180?text=No+Image';
    }

    editRecipeImageFile.value = '';
    
    // 🚀 清理旧的裁剪状态
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

    const updatedData = {
        name: document.getElementById('edit-recipe-name').value.trim(),
        category: document.getElementById('edit-recipe-category').value,
        tutorial_url: document.getElementById('edit-recipe-tutorial').value.trim() || null,
        ingredients: editIngredientsInput ? editIngredientsInput.value.trim() || null : null // 提交食材信息
    };

    let newImageUrl = oldImageUrl; 
    let fileToUpload = null;
    
    // 🚀 1. 处理裁剪逻辑 (如果存在 editCropper 实例，则优先使用裁剪后的 Blob)
    if (editCropper && originalFile) {
        editUploadStatus.textContent = '正在处理图片...';
        
        // 从 Cropper 获取裁剪后的 Blob
        fileToUpload = await new Promise((resolve) => {
            editCropper.getCroppedCanvas({
                width: 440, 
                height: 440,
            }).toBlob((blob) => {
                resolve(blob);
            }, originalFile.type, 0.9); // 0.9 是图片质量
        });

    } else if (originalFile) {
        // 2. 没有裁剪，但选择了新文件 (使用原始 File 对象)
        fileToUpload = originalFile;
    }

    // 3. 上传文件/Blob
    if (fileToUpload) {
        const uploadedUrl = await uploadRecipeImage(fileToUpload, editUploadStatus, updateRecipeBtn);
        
        if (!uploadedUrl) {
            return; 
        }
        
        newImageUrl = uploadedUrl;
        
        // 4. 只有当成功上传新图且旧图片不是默认图时，才删除旧图
        if (oldImageUrl !== DEFAULT_IMAGE_URL) {
            await deleteOldImage(oldImageUrl); 
        }
        
        // 5. 清理 Cropper 状态
        if (editCropper) editCropper.destroy();
        editCropper = null;
        if(editImageCropArea) editImageCropArea.style.display = 'none';
        editRecipeImageFile.value = '';
    }

    updatedData.image_url = newImageUrl;

    // 6. 更新数据库
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
    
    // ... (分类/总数选择逻辑 - 保持不变) ...
    const meatCount = parseInt(options.meatCount);
    const seafoodCount = parseInt(options.seafoodCount);
    const vegCount = parseInt(options.vegCount);
    const totalCount = parseInt(options.totalCount);
    
    const categoryTotal = meatCount + seafoodCount + vegCount;
    const isCategoryMode = categoryTotal > 0 && (meatCount > 0 || seafoodCount > 0 || vegCount > 0); 

    if (isCategoryMode) {
        const meatRecipes = allRecipes.filter(r => r.category === 'meat');
        const seafoodRecipes = allRecipes.filter(r => r.category === 'seafood');
        const vegRecipes = allRecipes.filter(r => r.category === 'vegetable');
        
        selectedRecipes = [
            ...getRandomItems(meatRecipes, meatCount),
            ...getRandomItems(seafoodRecipes, seafoodCount),
            ...getRandomItems(vegRecipes, vegCount)
        ];
        
        let missingCount = 0;
        if (meatCount > meatRecipes.length) missingCount += (meatCount - meatRecipes.length);
        if (seafoodCount > seafoodRecipes.length) missingCount += (seafoodCount - meatRecipes.length);
        if (vegCount > vegRecipes.length) missingCount += (vegCount - vegRecipes.length);
        
        if (missingCount > 0 && menuStatus) {
             menuStatus.textContent = `注意：有 ${missingCount} 道菜品因库存不足，未能按要求生成。`;
        }

    } else {
        if (allRecipes.length < totalCount && menuStatus) {
            menuStatus.textContent = `注意：菜品总数不足 ${totalCount} 道，已返回全部 ${allRecipes.length} 道菜。`;
        }
        selectedRecipes = getRandomItems(allRecipes, totalCount);
    }
    // ... (分类/总数选择逻辑结束) ...
    
    
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
            const translatedCategory = CATEGORY_MAP[recipe.category] || CATEGORY_MAP.default;
            
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
    
    // 初始加载
    if (newRecipeModal) {
        fetchAndRenderRecipes(getCurrentCategory(), getCurrentSort()); 
    }

    // --- 导航栏和排序监听 (保持不变) ---
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault(); 
            navLinks.forEach(item => item.classList.remove('active'));
            link.classList.add('active');
            fetchAndRenderRecipes(link.dataset.category, getCurrentSort()); 
        });
    });

    if (sortByControl) {
        sortByControl.addEventListener('change', () => {
            fetchAndRenderRecipes(getCurrentCategory(), getCurrentSort()); 
        });
    }
    
    // --- 卡片动作 (编辑/删除) 委托 (保持不变) ---
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
    if(addRecipeBtn) addRecipeBtn.onclick = () => { if(newRecipeModal) newRecipeModal.style.display = 'block'; };
    if(newRecipeCloseBtn) newRecipeCloseBtn.onclick = () => { 
        if(newRecipeModal) newRecipeModal.style.display = 'none'; 
        // 退出时清除 Cropper 实例和图片区域
        if (cropper) cropper.destroy();
        cropper = null;
        if(imageCropArea) imageCropArea.style.display = 'none';
        newRecipeForm.reset();
    };

    if(editRecipeCloseBtn) editRecipeCloseBtn.onclick = () => { 
        if(editRecipeModal) editRecipeModal.style.display = 'none'; 
        // 🚀 退出时清除编辑 Cropper 实例和图片区域
        if (editCropper) editCropper.destroy();
        editCropper = null;
        if(editImageCropArea) editImageCropArea.style.display = 'none';
    };
    if(editRecipeForm) editRecipeForm.addEventListener('submit', handleEditFormSubmit);

    // --- 菜单生成模态框事件 (保持不变) ---
    const generateMenuBtn = document.getElementById('generate-menu-btn');
    if(generateMenuBtn) generateMenuBtn.onclick = () => { if(generatorModal) generatorModal.style.display = 'block'; };
    
    const generatorCloseBtn = generatorModal ? generatorModal.querySelector('.generate-close-btn') : null;
    if(generatorCloseBtn) generatorCloseBtn.onclick = () => { if(generatorModal) generatorModal.style.display = 'none'; };

    const displayCloseBtn = menuDisplayModal ? menuDisplayModal.querySelector('.display-close-btn') : null;
    if(displayCloseBtn) displayCloseBtn.onclick = () => { if(menuDisplayModal) menuDisplayModal.style.display = 'none'; };
    
    const generatorForm = document.getElementById('menu-generator-form');
    if(generatorForm) generatorForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const options = {
            totalCount: document.getElementById('total-count').value,
            meatCount: document.getElementById('meat-count').value,
            seafoodCount: document.getElementById('seafood-count').value,
            vegCount: document.getElementById('vegetable-count').value,
        };
        if(generatorModal) generatorModal.style.display = 'none';
        generateRandomMenu(options);
    });
    
    // --- 全局模态框关闭逻辑 (保持不变) ---
    window.onclick = (event) => {
        if (event.target == newRecipeModal) {
            if(newRecipeCloseBtn) newRecipeCloseBtn.click(); // 使用点击关闭按钮的逻辑
        }
        if (event.target == generatorModal) {
            if(generatorModal) generatorModal.style.display = 'none';
        }
        if (event.target == menuDisplayModal) {
            if(menuDisplayModal) menuDisplayModal.style.display = 'none';
        }
        if (event.target == editRecipeModal) {
             if(editRecipeCloseBtn) editRecipeCloseBtn.click(); // 🚀 使用点击关闭按钮的逻辑来清理 Cropper 状态
        }
    };
    
    // =======================================================
    // 🚀 新增功能：图片裁剪 (Cropper.js) 逻辑
    // =======================================================
    
    // 1. 新增菜谱：监听文件选择变化，初始化 Cropper
    if(recipeImageFile && imageToCrop) {
        recipeImageFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    imageToCrop.src = event.target.result; 
                    if(imageCropArea) imageCropArea.style.display = 'block';
                
                    if (cropper) {
                        cropper.destroy();
                    }
                
                    cropper = new Cropper(imageToCrop, {
                        aspectRatio: NaN, // 允许用户自由调整长宽
                        viewMode: 1,
                        initialAspectRatio: 1,
                        autoCropArea: 1,
                        responsive: true,
                        background: false,
                        dragMode: 'move',
                        
                        cropBoxMovable: true, 
                        cropBoxResizable: true, 
                        toggleDragModeOnDblclick: false,
                    });
                };
                reader.readAsDataURL(file);
            } else {
                if(imageCropArea) imageCropArea.style.display = 'none';
                if (cropper) cropper.destroy();
                cropper = null;
            }
        });
    }
    
    // 🚀 2. 编辑菜谱：监听文件选择变化，初始化 Cropper (新增逻辑)
    if (editRecipeImageFile && editImageToCrop) {
        editRecipeImageFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    editImageToCrop.src = event.target.result;
                    if (editImageCropArea) editImageCropArea.style.display = 'block';

                    if (editCropper) {
                        editCropper.destroy();
                    }

                    editCropper = new Cropper(editImageToCrop, {
                        aspectRatio: NaN, // 允许自由调整长宽
                        viewMode: 1,
                        initialAspectRatio: 1,
                        autoCropArea: 1,
                        responsive: true,
                        background: false,
                        dragMode: 'move',
                        
                        cropBoxMovable: true,
                        cropBoxResizable: true,
                        toggleDragModeOnDblclick: false,
                    });
                };
                reader.readAsDataURL(file);
                
                // 隐藏当前的图片预览，因为裁剪区域已显示
                if(editCurrentImage) editCurrentImage.style.display = 'none';
            } else {
                if (editImageCropArea) editImageCropArea.style.display = 'none';
                if (editCropper) editCropper.destroy();
                editCropper = null;
                if(editCurrentImage) editCurrentImage.style.display = 'block';
            }
        });
    }

    
    // 3. 提交表单处理 (新增菜谱)
    if(newRecipeForm) newRecipeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const recipeName = document.getElementById('recipe-name').value.trim();
        const recipeCategory = document.getElementById('recipe-category').value;
        const recipeTutorial = document.getElementById('recipe-tutorial').value.trim();
        const initialRating = parseInt(newRecipeRatingInput.value, 10);
        const recipeIngredients = document.getElementById('recipe-ingredients').value.trim();

        const originalFile = recipeImageFile.files[0]; 
        let imageUrl = DEFAULT_IMAGE_URL; 
        let fileToUpload = null;

        // --- 裁剪逻辑开始 ---
        if (cropper && originalFile) {
            uploadStatus.textContent = '正在处理图片...';
            
            // 获取裁剪后的文件 Blob
            fileToUpload = await new Promise((resolve) => {
                cropper.getCroppedCanvas({
                    width: 440, 
                    height: 440,
                }).toBlob((blob) => {
                    resolve(blob);
                }, originalFile.type, 0.9); // 0.9 是图片质量
            });
            
        } else if (originalFile) {
            // 没有裁剪但选择了文件 (使用原始 File 对象)
            fileToUpload = originalFile;
        }
        // --- 裁剪逻辑结束 ---

        if (fileToUpload) {
            imageUrl = await uploadRecipeImage(fileToUpload, uploadStatus, saveRecipeBtn);
            if (!imageUrl) return;
        } 

        const tutorialUrl = recipeTutorial === '' ? null : recipeTutorial;
        const ingredientsData = recipeIngredients === '' ? null : recipeIngredients;


        const { error } = await supabase
            .from(RECIPE_TABLE)
            .insert([{ 
                name: recipeName, 
                category: recipeCategory, 
                image_url: imageUrl, 
                tutorial_url: tutorialUrl, 
                rating: initialRating,
                ingredients: ingredientsData
            }])
            .select();

        if (error) {
            console.error('新增菜谱失败:', error);
            alert('新增菜谱失败。请检查 Supabase INSERT 策略！');
        } else {
            alert(`菜谱 "${recipeName}" 添加成功！`);
            newRecipeForm.reset(); 
            recipeImageFile.value = ''; 
            if(newRecipeModal) newRecipeModal.style.display = 'none';
            // 清理 Cropper 状态
            if (cropper) cropper.destroy();
            cropper = null;
            if(imageCropArea) imageCropArea.style.display = 'none';
            
            fetchAndRenderRecipes(getCurrentCategory(), getCurrentSort(), true); 
        }
    });
});
