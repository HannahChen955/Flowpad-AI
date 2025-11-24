import React from 'react';
import ReactDOM from 'react-dom/client';
import FloatingButton from './components/FloatingButton';
import './index.css';

// Debug: 浮窗入口文件加载日志
const FLOATING_VERSION = 'v2.0.1-clean-' + Date.now();
console.log('FloatingEntry: 浮窗入口文件开始执行 - VERSION:', FLOATING_VERSION);
console.log('FloatingEntry: 当前环境', {
  windowSize: { width: window.innerWidth, height: window.innerHeight },
  userAgent: navigator.userAgent,
  version: FLOATING_VERSION
});

// 设置浮窗页面样式
document.body.classList.add('floating-window');

console.log('FloatingEntry: 浮窗页面样式已设置');

// 先测试基础DOM操作
console.log('FloatingEntry: 脚本开始执行');
console.log('FloatingEntry: document.readyState =', document.readyState);

// 等待DOM准备就绪
document.addEventListener('DOMContentLoaded', () => {
  console.log('FloatingEntry: DOM内容已加载');

  const rootElement = document.getElementById('floating-root');
  console.log('FloatingEntry: floating-root元素:', rootElement);

  if (rootElement) {
    console.log('FloatingEntry: 根元素找到，尝试渲染React');

    try {
      const root = ReactDOM.createRoot(rootElement);
      root.render(
        <React.StrictMode>
          <FloatingButton />
        </React.StrictMode>
      );
      console.log('FloatingEntry: React组件渲染成功');
    } catch (error) {
      console.error('FloatingEntry: React渲染失败', error);
    }
  } else {
    console.error('FloatingEntry: 找不到floating-root元素');
    // 创建一个测试元素
    document.body.innerHTML += `
      <div style="
        position: fixed;
        top: 10px;
        left: 10px;
        background: red;
        color: white;
        padding: 10px;
        border-radius: 5px;
        z-index: 9999;
      ">
        ERROR: floating-root元素未找到
      </div>
    `;
  }
});

// 只使用DOMContentLoaded事件，避免重复渲染