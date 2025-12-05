import ReactDOM from 'react-dom/client';
import FloatingButton from './components/FloatingButton';
import './index.css';

// 浮窗入口文件日志
const FLOATING_VERSION = 'v2.0.5-stable-' + Date.now();
console.log('FloatingEntry: 浮窗初始化 - VERSION:', FLOATING_VERSION);

// 设置浮窗页面样式
document.body.classList.add('floating-window');


// 等待DOM准备就绪
document.addEventListener('DOMContentLoaded', () => {
  const rootElement = document.getElementById('floating-root');

  if (rootElement) {
    try {
      const root = ReactDOM.createRoot(rootElement);
      root.render(<FloatingButton />);
      console.log('FloatingEntry: React组件渲染成功');

      // 验证组件是否正确渲染
      setTimeout(() => {
        const floatingButton = rootElement.querySelector('.floating-button, [data-floating-button]');
        if (!floatingButton) {
          console.error('FloatingEntry: FloatingButton组件渲染失败');
          // 显示错误提示
          rootElement.innerHTML = '<div style="background: red; color: white; padding: 10px; border-radius: 5px;">浮窗组件加载失败</div>';
        }
      }, 2000);
    } catch (error) {
      console.error('FloatingEntry: React渲染失败', error);

      // 显示简洁的错误信息
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
          <strong>浮窗加载错误</strong><br>
          ${(error as Error).message}<br>
          <br>
          <small>请重启应用或检查控制台</small>
        </div>
      `;
    }
  } else {
    console.error('FloatingEntry: 找不到浮窗根元素');
    // 显示错误提示
    document.body.innerHTML = `
      <div style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: red;
        color: white;
        padding: 20px;
        border-radius: 8px;
        font-family: monospace;
        font-size: 12px;
        text-align: center;
        z-index: 9999;
      ">
        浮窗初始化失败<br>
        <small>请重启应用</small>
      </div>
    `;
  }
});

// 只使用DOMContentLoaded事件，避免重复渲染
