// 通用功能

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 检查登录状态
    const user = checkLogin();
    if (user) {
        showUserInfo(user);
    } else if (!window.location.pathname.includes('index')) {
        // 未登录且不在首页，重定向到首页
        // window.location.href = '/';
    }
});

// 显示用户信息
function showUserInfo(user) {
    const userInfo = document.getElementById('user-info');
    const userName = document.getElementById('user-name');
    if (userInfo && userName) {
        userInfo.style.display = 'block';
        userName.textContent = user.nickname || user.username;
    }
}

// 退出登录
function logout() {
    localStorage.removeItem('user');
    window.location.href = '/';
}

// 格式化时间
function formatDuration(seconds) {
    if (!seconds) return '0分钟';
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
        return `${hours}小时${minutes % 60}分钟`;
    }
    return `${minutes}分钟`;
}

// 格式化日期
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 显示加载状态
function showLoading(element, text = '加载中...') {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    if (element) {
        element.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="loading"></div><p style="color: #888; margin-top: 10px;">${text}</p></div>`;
    }
}

// 显示错误
function showError(element, message) {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    if (element) {
        element.innerHTML = `<div style="text-align: center; padding: 40px; color: #e74c3c;">❌ ${message}</div>`;
    }
}

// 显示空数据
function showEmpty(element, text = '暂无数据') {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    if (element) {
        element.innerHTML = `<div style="text-align: center; padding: 40px; color: #888;">${text}</div>`;
    }
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 节流函数
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// 分页组件
function renderPagination(container, currentPage, totalPages, onPageChange) {
    if (totalPages <= 1) return;

    let html = '';

    // 上一页
    html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="${onPageChange}(${currentPage - 1})">上一页</button>`;

    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="${onPageChange}(${i})">${i}</button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            html += `<span style="color: #888;">...</span>`;
        }
    }

    // 下一页
    html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="${onPageChange}(${currentPage + 1})">下一页</button>`;

    container.innerHTML = html;
}
