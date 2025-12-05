import React from 'react';
import ReactDOM from 'react-dom/client';
import FloatingButton from './components/FloatingButton';
import './index.css';

// Debug: 浮窗入口文件加载日志
const FLOATING_VERSION = 'v2.0.1-debug-' + Date.now();
console.log('FloatingEntry: 浮窗入口文件开始执行 - VERSION:', FLOATING_VERSION);
console.log('FloatingEntry: 当前环境', {
  windowSize: { width: window.innerWidth, height: window.innerHeight },
  userAgent: navigator.userAgent,
  version: FLOATING_VERSION,
  electronAPI: typeof (window as any).electronAPI,
  hasExpandHandler: typeof (window as any).electronAPI?.onExpandFloatingWindow
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
    console.log('FloatingEntry: 根元素属性:', {
      id: rootElement.id,
      className: rootElement.className,
      style: rootElement.getAttribute('style'),
      clientWidth: rootElement.clientWidth,
      clientHeight: rootElement.clientHeight
    });

    try {
      // 先添加一个测试元素确保渲染容器可用
      rootElement.innerHTML = '<div style="color: blue; padding: 10px; background: yellow;">测试: React渲染准备中...</div>';

      const root = ReactDOM.createRoot(rootElement);
      root.render(
        <React.StrictMode>
          <FloatingButton />
        </React.StrictMode>
      );
      console.log('FloatingEntry: React组件渲染成功');

      // 5秒后检查组件是否正确渲染
      setTimeout(() => {
        const floatingButton = rootElement.querySelector('.floating-button, [data-floating-button]');
        console.log('FloatingEntry: 延迟检查 - FloatingButton是否渲染:', !!floatingButton);
        if (!floatingButton) {
          console.error('FloatingEntry: FloatingButton组件未正确渲染到DOM中');
          rootElement.innerHTML += '<div style="background: orange; color: white; padding: 5px;">WARNING: FloatingButton组件未找到</div>';
        }
      }, 5000);
    } catch (error) {
      console.error('FloatingEntry: React渲染失败', error);
      console.error('FloatingEntry: 错误堆栈:', error.stack);

      // 显示错误信息
      rootElement.innerHTML = `
        <div style="
          background: red;
          color: white;
          padding: 15px;
          border-radius: 8px;
          font-family: monospace;
          font-size: 12px;
          line-height: 1.4;
          margin: 10px;
        ">
          <strong>React渲染错误:</strong><br>
          ${error.message}<br>
          <br>
          <small>请检查控制台获取详细错误信息</small>
        </div>
      `;
    }
  } else {
    console.error('FloatingEntry: 找不到floating-root元素');
    console.error('FloatingEntry: document.body.innerHTML:', document.body.innerHTML);

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
        font-family: monospace;
        font-size: 12px;
      ">
        ERROR: floating-root元素未找到<br>
        请检查 floating.html 文件
      </div>
    `;
  }
});

// 只使用DOMContentLoaded事件，避免重复渲染
