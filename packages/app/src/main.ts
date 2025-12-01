import { app, BrowserWindow, globalShortcut, ipcMain, Menu, Tray, nativeImage } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { FlowpadDB, ContextCapture, AIService, CreateNoteInput, AIConfig } from '../../core/dist/index';

// 加载.env文件（如果存在）
dotenv.config({ path: path.join(__dirname, '../../../.env') });

// 全局安全日志系统，避免终端关闭后的 EPIPE 错误
class SafeLogger {
  private terminalDisconnected = false;

  constructor() {
    // 监听进程事件以检测终端断开连接
    process.on('SIGPIPE', () => {
      this.terminalDisconnected = true;
    });

    process.on('EPIPE', () => {
      this.terminalDisconnected = true;
    });

    // 防止应用在终端关闭时退出
    process.on('SIGHUP', () => {
      // 忽略SIGHUP信号，防止终端关闭时应用退出
      this.terminalDisconnected = true;
    });

    process.on('SIGTERM', () => {
      // 忽略SIGTERM信号（除非是真正的应用退出请求）
      this.terminalDisconnected = true;
    });

    // 监听 stdout/stderr 的错误事件
    process.stdout.on('error', (err) => {
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') {
        this.terminalDisconnected = true;
      }
    });

    process.stderr.on('error', (err) => {
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') {
        this.terminalDisconnected = true;
      }
    });
  }

  private isTerminalAvailable(): boolean {
    if (this.terminalDisconnected) {
      return false;
    }

    try {
      // 检查 stdout 和 stderr 是否可用
      return process.stdout.writable && process.stderr.writable && !process.stdout.destroyed && !process.stderr.destroyed;
    } catch {
      this.terminalDisconnected = true;
      return false;
    }
  }

  log(message: string, ...args: any[]): void {
    try {
      if (this.isTerminalAvailable()) {
        console.log(message, ...args);
      }
    } catch (error: any) {
      // 检测 EPIPE 或连接重置错误并静默处理
      if (error.code === 'EPIPE' || error.code === 'ECONNRESET' || error.errno === -32) {
        this.terminalDisconnected = true;
      }
      // 完全静默处理，不再尝试写入
    }
  }

  warn(message: string, ...args: any[]): void {
    try {
      if (this.isTerminalAvailable()) {
        console.warn(message, ...args);
      }
    } catch (error: any) {
      // 检测 EPIPE 或连接重置错误并静默处理
      if (error.code === 'EPIPE' || error.code === 'ECONNRESET' || error.errno === -32) {
        this.terminalDisconnected = true;
      }
      // 完全静默处理，不再尝试写入
    }
  }

  error(message: string, ...args: any[]): void {
    try {
      if (this.isTerminalAvailable()) {
        console.error(message, ...args);
      }
    } catch (error: any) {
      // 检测 EPIPE 或连接重置错误并静默处理
      if (error.code === 'EPIPE' || error.code === 'ECONNRESET' || error.errno === -32) {
        this.terminalDisconnected = true;
      }
      // 完全静默处理，不再尝试写入
    }
  }
}

const safeLogger = new SafeLogger();

class FlowpadApp {
  private mainWindow: BrowserWindow | null = null;
  private floatingWindow: BrowserWindow | null = null;
  private db: FlowpadDB;
  private contextCapture: ContextCapture;
  private aiService: AIService | null = null;
  private tray: Tray | null = null;

  // 应用状态管理
  private appState = {
    floatingWindowVisible: false,
    mainWindowVisible: false,
    autoStartEnabled: false,
  };

  constructor() {
    // 初始化数据库
    const dbPath = path.join(app.getPath('userData'), 'flowpad.db');
    this.db = new FlowpadDB({ path: dbPath });

    // 初始化上下文捕获
    this.contextCapture = new ContextCapture();

    // 初始化AI服务（如果有配置）
    this.initAIService();

    // 启动时清理已完成的旧笔记
    this.setupCleanupTasks();
  }

  // 状态管理方法
  private updateAppState(updates: Partial<typeof this.appState>): void {
    this.appState = { ...this.appState, ...updates };
    this.broadcastStateChange();
    this.updateTrayMenu();
  }

  private broadcastStateChange(): void {
    // 向主窗口发送状态更新
    if (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.webContents.isDestroyed()) {
      try {
        this.mainWindow.webContents.send('app-state-changed', this.appState);
      } catch (error) {
        safeLogger.warn('Failed to broadcast state change to main window:', error);
      }
    }
  }

  private updateTrayMenu(): void {
    if (!this.tray || this.tray.isDestroyed()) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Flowpad',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: '显示主窗口',
        click: () => this.showMainWindow(),
      },
      {
        label: `快速记录 (⌥N) ${this.appState.floatingWindowVisible ? '✓' : ''}`,
        click: () => this.toggleFloatingWindow(),
      },
      { type: 'separator' },
      {
        label: `开机自启动 ${this.appState.autoStartEnabled ? '✓' : ''}`,
        click: () => this.toggleAutoStart(),
      },
      { type: 'separator' },
      {
        label: '退出 Flowpad',
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  private toggleAutoStart(): void {
    const newAutoStartEnabled = !this.appState.autoStartEnabled;
    app.setLoginItemSettings({
      openAtLogin: newAutoStartEnabled,
      openAsHidden: newAutoStartEnabled,
    });
    this.updateAppState({ autoStartEnabled: newAutoStartEnabled });
    safeLogger.log(`开机自启动${newAutoStartEnabled ? '已开启' : '已关闭'}`);
  }

  async init(): Promise<void> {
    // 初始化应用状态
    const autoLaunch = app.getLoginItemSettings();
    this.updateAppState({
      autoStartEnabled: autoLaunch.openAtLogin
    });

    // 设置开机自启动（仅在生产环境）
    if (process.env.NODE_ENV === 'production') {
      if (!autoLaunch.openAtLogin) {
        // 默认开启自启动，用户可以在设置中关闭
        app.setLoginItemSettings({
          openAtLogin: true,
          openAsHidden: true, // 启动时隐藏窗口，只显示系统托盘
        });
        this.updateAppState({ autoStartEnabled: true });
      }
    }

    // 确保单实例
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
      safeLogger.log('另一个实例已经在运行，退出当前实例');
      app.quit();
      return;
    }

    // 如果有第二个实例尝试启动，激活现有窗口
    app.on('second-instance', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore();
        this.mainWindow.focus();
      }
    });

    // 等待应用准备就绪
    await app.whenReady();

    // 创建主窗口
    this.createMainWindow();

    // 创建浮窗（隐藏状态）
    this.createFloatingWindow();

    // 注册全局快捷键
    this.registerGlobalShortcuts();

    // 设置系统托盘
    this.createTray();

    // 注册IPC处理器
    this.registerIpcHandlers();

    // 处理应用事件
    this.handleAppEvents();
  }

  private createMainWindow(): void {
    // 设置窗口图标
    let windowIcon;
    try {
      const iconPath = path.join(__dirname, 'assets/icon.png');
      safeLogger.log('MainWindow: 尝试加载窗口图标:', iconPath);
      windowIcon = nativeImage.createFromPath(iconPath);
      if (windowIcon.isEmpty()) {
        throw new Error('Icon file not found');
      }
      safeLogger.log('MainWindow: 窗口图标加载成功');
    } catch (error) {
      safeLogger.log('MainWindow: 窗口图标加载失败，使用默认图标');
      windowIcon = undefined;
    }

    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      icon: windowIcon, // 设置窗口图标
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
      titleBarStyle: 'default',
      show: true, // 启动时直接显示
    });

    // 在开发环境中加载开发服务器，否则加载构建的文件
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.loadURL('http://localhost:3001');
      // this.mainWindow.webContents.openDevTools(); // 注释掉自动打开开发者工具
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../../renderer/dist/index.html'));
    }

    // 窗口准备好后显示
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
    });

    // 窗口关闭时隐藏而不是退出（保持系统托盘运行）
    this.mainWindow.on('close', (event) => {
      event.preventDefault();
      this.mainWindow?.hide();
    });
  }

  private createFloatingWindow(): void {
    // 创建一个小的浮窗，只包含按钮，不覆盖整个屏幕
    this.floatingWindow = new BrowserWindow({
      width: 60,  // 足够容纳按钮的宽度
      height: 60, // 足够容纳按钮的高度
      x: 100,     // 默认位置
      y: 100,     // 默认位置
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      // 允许focusable但通过智能focus管理避免打断用户工作流
      // visibleOnAllWorkspaces: true, // 在所有虚拟桌面可见 - 在当前Electron版本中不支持
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: true,
        spellcheck: false, // 禁用拼写检查以避免输入法问题
      },
      show: false,
      transparent: false, // 临时禁用透明以确保内容可见
      hasShadow: false,
      acceptFirstMouse: true,
      titleBarStyle: 'hiddenInset',
      roundedCorners: false, // 临时禁用圆角防止渲染问题
      // 临时禁用macOS视觉效果以排除渲染问题
      // ...(process.platform === 'darwin' && {
      //   vibrancy: 'hud', // macOS上的毛玻璃效果
      //   visualEffectState: 'active',
      //   type: 'panel' // 使用面板类型减少系统干预
      // })
    });

    // 让浮窗在所有空间/全屏上都可见，避免因空间切换打断全屏
    if (this.floatingWindow.setVisibleOnAllWorkspaces) {
      this.floatingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    // 使用全局安全日志方法
    const safeLog = (message: string, ...args: any[]) => {
      safeLogger.log(message, ...args);
    };

    // Debug: 监听浮窗控制台消息，添加错误处理
    this.floatingWindow.webContents.on('console-message', (_, level, message) => {
      safeLog(`FloatingWindow [${level}]:`, message);
    });

    // Debug: 监听页面加载事件
    this.floatingWindow.webContents.on('did-finish-load', () => {
      safeLog('FloatingWindow: 页面加载完成');

      // 简单调试日志，但要检查窗口是否仍然存在
      setTimeout(() => {
        safeLog('FloatingWindow: React组件已初始化');
      }, 1000);
    });

    this.floatingWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
      safeLog('FloatingWindow: 页面加载失败', errorCode, errorDescription);
    });

    this.floatingWindow.webContents.on('did-start-loading', () => {
      safeLog('FloatingWindow: 开始加载页面');
    });

    this.floatingWindow.webContents.on('dom-ready', () => {
      safeLog('FloatingWindow: DOM准备完成');
    });

    // 加载浮窗页面
    if (process.env.NODE_ENV === 'development') {
      const url = 'http://localhost:3001/floating?v=' + Date.now(); // 添加版本参数避免缓存
      safeLog('FloatingWindow: 准备加载开发环境URL:', url);

      // 临时禁用缓存清除以支持状态持久化
      // this.floatingWindow.webContents.session.clearCache().then(() => {
      //   safeLog('FloatingWindow: 缓存已清除');
      //   return this.floatingWindow?.loadURL(url);
      // }).then(() => {
      //   safeLog('FloatingWindow: loadURL 成功完成');
      // }).catch(err => {
      //   safeLog('FloatingWindow: loadURL 失败:', err);
      // });

      // 直接加载URL，保持状态持久化
      safeLog('FloatingWindow: 开始加载页面（保持持久化状态）');
      this.floatingWindow.loadURL(url).then(() => {
        safeLog('FloatingWindow: loadURL 成功完成');
      }).catch(err => {
        safeLog('FloatingWindow: loadURL 失败:', err);
      });
    } else {
      const filePath = path.join(__dirname, '../../renderer/dist/floating.html');
      safeLog('FloatingWindow: 加载生产环境文件', filePath);
      this.floatingWindow.loadFile(filePath);
    }

    // 窗口准备好后根据设置决定是否显示
    this.floatingWindow.once('ready-to-show', () => {
      safeLog('FloatingWindow: ready-to-show 事件触发');

      // 安全地获取数据库设置，添加错误处理
      let enabled = 'false';
      try {
        enabled = this.db.getSetting('floating_window_enabled') || 'false';
        safeLog('FloatingWindow: 数据库设置:', enabled);
      } catch (error) {
        safeLog('FloatingWindow: 数据库读取失败，使用默认值:', error);
        enabled = 'false';
      }

      // 临时强制启用浮窗以修复状态不一致问题
      // 因为主窗口UI显示"已启用"但后台数据库为false
      safeLog('FloatingWindow: 强制启用浮窗（修复状态不一致）');
      safeLog('FloatingWindow: 当前窗口尺寸', this.floatingWindow?.getSize?.());
      safeLog('FloatingWindow: 当前窗口位置', this.floatingWindow?.getPosition?.());
      this.floatingWindow?.show();
      this.safeDatabaseSet('floating_window_enabled', 'true');
      safeLog('FloatingWindow: 浮窗已显示，数据库已更新为启用');

      // 开发环境：浮窗已就绪
      if (process.env.NODE_ENV === 'development') {
        safeLog('FloatingWindow: 开发环境 - 浮窗已就绪');
        // 如需调试，可手动打开DevTools：this.floatingWindow?.webContents.openDevTools();
      }
    });

    // 监听浮窗关闭事件，同步状态
    this.floatingWindow.on('close', () => {
      // 更新数据库设置（使用安全方法）
      this.safeDatabaseSet('floating_window_enabled', 'false');
      // 通知主窗口浮窗状态已改变
      if (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.webContents.isDestroyed()) {
        try {
          this.mainWindow.webContents.send('floating-window-state-changed', false);
        } catch (error) {
          safeLogger.warn('Failed to send floating window close state to main window:', error);
        }
      }
    });

    // 监听浮窗隐藏事件，同步状态
    this.floatingWindow.on('hide', () => {
      // 更新数据库设置（使用安全方法）
      this.safeDatabaseSet('floating_window_enabled', 'false');
      // 通知主窗口浮窗状态已改变
      if (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.webContents.isDestroyed()) {
        try {
          this.mainWindow.webContents.send('floating-window-state-changed', false);
        } catch (error) {
          safeLogger.warn('Failed to send floating window hide state to main window:', error);
        }
      }
    });

    // 监听浮窗显示事件，同步状态
    this.floatingWindow.on('show', () => {
      // 更新数据库设置（使用安全方法）
      this.safeDatabaseSet('floating_window_enabled', 'true');
      // 通知主窗口浮窗状态已改变
      if (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.webContents.isDestroyed()) {
        try {
          this.mainWindow.webContents.send('floating-window-state-changed', true);
        } catch (error) {
          safeLogger.warn('Failed to send floating window show state to main window:', error);
        }
      }
    });
  }

  private registerGlobalShortcuts(): void {
    try {
      safeLogger.log('开始注册全局快捷键...');

      // 注册 Option+N 快捷键显示浮窗并自动展开到对话模式
      const optionN = globalShortcut.register('Option+N', () => {
        safeLogger.log('Option+N 快捷键被触发');
        this.showFloatingWindowExpanded();
      });
      safeLogger.log('Option+N 注册结果:', optionN);

      // 注册 Option+M 快捷键显示主窗口
      const optionM = globalShortcut.register('Option+M', () => {
        safeLogger.log('Option+M 快捷键被触发');
        this.showMainWindow();
      });
      safeLogger.log('Option+M 注册结果:', optionM);

      // 注册 Option+H 快捷键隐藏所有窗口
      const optionH = globalShortcut.register('Option+H', () => {
        safeLogger.log('Option+H 快捷键被触发');
        this.hideAllWindows();
      });
      safeLogger.log('Option+H 注册结果:', optionH);

      // 注册 Option+Q 快捷键退出应用
      const optionQ = globalShortcut.register('Option+Q', () => {
        safeLogger.log('Option+Q 快捷键被触发');
        this.quit();
      });
      safeLogger.log('Option+Q 注册结果:', optionQ);

      // 注册 Option+T 快捷键切换浮窗显示状态
      const optionT = globalShortcut.register('Option+T', () => {
        safeLogger.log('Option+T 快捷键被触发');
        this.toggleFloatingWindow();
      });
      safeLogger.log('Option+T 注册结果:', optionT);

      // 注册 Option+D 快捷键显示今日总结
      const optionD = globalShortcut.register('Option+D', () => {
        safeLogger.log('Option+D 快捷键被触发');
        this.showTodayDigest();
      });
      safeLogger.log('Option+D 注册结果:', optionD);

      // 注册 Option+Shift+N 快捷键快速收起浮窗
      const optionShiftN = globalShortcut.register('Option+Shift+N', () => {
        safeLogger.log('Option+Shift+N 快捷键被触发');
        this.hideFloatingWindow();
      });
      safeLogger.log('Option+Shift+N 注册结果:', optionShiftN);

      safeLogger.log('已注册全局快捷键:');
      safeLogger.log('  Option+N: 显示快速记录窗口');
      safeLogger.log('  Option+Shift+N: 快速收起浮窗');
      safeLogger.log('  Option+M: 显示主窗口');
      safeLogger.log('  Option+H: 隐藏所有窗口');
      safeLogger.log('  Option+Q: 退出应用');
      safeLogger.log('  Option+T: 切换浮窗状态');
      safeLogger.log('  Option+D: 显示今日总结');
    } catch (error) {
      safeLogger.error('注册全局快捷键失败:', error);
      safeLogger.log('可能需要在 系统偏好设置 > 安全性与隐私 > 隐私 > 辅助功能 中添加应用权限');
    }
  }

  private createTray(): void {
    // 创建托盘图标（使用内置的模板或从数据URL创建）
    let trayIcon;
    try {
      // 尝试加载自定义图标
      const iconPath = path.join(__dirname, 'assets/icon.png');
      safeLogger.log('Tray: 尝试加载图标路径:', iconPath);
      safeLogger.log('Tray: __dirname =', __dirname);

      trayIcon = nativeImage.createFromPath(iconPath);
      safeLogger.log('Tray: 图标是否为空:', trayIcon.isEmpty());

      // 如果图标为空，使用简单的模板图标
      if (trayIcon.isEmpty()) {
        throw new Error('Custom icon not found');
      }
      safeLogger.log('Tray: 自定义图标加载成功');
    } catch (error) {
      safeLogger.log('Tray: 自定义图标加载失败:', (error as Error).message);
      // 使用简单的模板图标 - 创建一个16x16的小图标
      trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA8klEQVR4nL2TMQ7CMAwF3yYVEhNiY2VgYGJgQEysDCxMrOwsLCwsrCwsLCwsrCwsLCwsDCwMbCxMrOxdJW1Sg/wl/8nJ+98vJgQhCEFIkmRJkiRJkiT9AzDGEEKIMYYxxhhjjDH2t2CtZYwxxhhjjDHGGGP/ADDGEEKIMcYYY4wxxhj7G7DWMsYYY4wxxhhjjLF/AICIiIiIiIiIiOgfQkSUJEmSJEmSJEn/ACIiotYwxhhjjDHG2N+AtZYxxhhjjDHGGGP/AIiIqDWMMcYYY4wx9jdgrWWMMcYYY4wxxv4BAFprbW2ttbbW2lprrd0DAACAENELS5Lk1y8AAAAASUVORK5CYII=');
      safeLogger.log('Tray: 使用备用的内置图标');
    }

    this.tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));

    // 设置托盘菜单
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => this.showMainWindow(),
      },
      {
        label: '快速记录 (⌥N)',
        click: () => this.showFloatingWindow(),
      },
      { type: 'separator' },
      {
        label: '退出 Flowpad',
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
    this.tray.setToolTip('Flowpad - AI记事本');

    // 点击托盘图标显示主窗口
    this.tray.on('click', () => {
      this.showMainWindow();
    });
  }

  private showMainWindow(): void {
    if (this.mainWindow) {
      // 检测全屏状态：包括主窗口本身和其他应用可能的全屏状态
      if (this.isInFullScreenEnvironment()) {
        safeLogger.log('showMainWindow: 检测到全屏环境，跳过显示以保持全屏体验');
        return;
      }

      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
      this.updateAppState({ mainWindowVisible: true });
    }
  }

  // 检测是否处于全屏环境（包括其他应用的全屏）
  private isInFullScreenEnvironment(): boolean {
    if (!this.mainWindow) return false;

    try {
      // 1. 检查我们的主窗口是否全屏
      if (this.mainWindow.isFullScreen()) {
        safeLogger.log('全屏检测: Flowpad主窗口处于全屏状态');
        return true;
      }

      // 2. 通过屏幕尺寸和可用工作区域检测其他应用可能的全屏状态
      const { screen } = require('electron');
      const primaryDisplay = screen.getPrimaryDisplay();
      const workArea = primaryDisplay.workArea;
      const bounds = primaryDisplay.bounds;

      // 如果工作区域明显小于显示器边界，可能有全屏应用
      const hasFullScreenApp = (
        workArea.width < bounds.width - 10 ||
        workArea.height < bounds.height - 10
      );

      safeLogger.log(`全屏检测: 显示器尺寸:${bounds.width}x${bounds.height}, 工作区域:${workArea.width}x${workArea.height}`);

      if (hasFullScreenApp) {
        safeLogger.log('全屏检测: 检测到可能有其他应用全屏（工作区域受限）');
        return true;
      }

      // 3. 检查窗口焦点状态作为辅助判断
      const isFocused = this.mainWindow.isFocused();
      const isVisible = this.mainWindow.isVisible();
      const isMinimized = this.mainWindow.isMinimized();

      safeLogger.log(`全屏检测: 窗口状态 - 聚焦:${isFocused}, 可见:${isVisible}, 最小化:${isMinimized}`);

      return false;
    } catch (error) {
      safeLogger.error('全屏检测失败:', error);
      return false;
    }
  }

  private showFloatingWindow(): void {
    // 使用全局安全日志方法
    const safeMethodLog = (message: string, ...args: any[]) => {
      safeLogger.log(message, ...args);
    };

    safeMethodLog('showFloatingWindow: 开始显示浮窗');

    // TEMPORARY: 强制销毁现有浮窗以清除缓存问题
    if (this.floatingWindow && !this.floatingWindow.isDestroyed()) {
      safeMethodLog('showFloatingWindow: 强制销毁现有浮窗以清除缓存');
      this.floatingWindow.destroy();
      this.floatingWindow = null;
    }

    safeMethodLog('showFloatingWindow: 重新创建浮窗');
    this.createFloatingWindow();

    if (this.floatingWindow && !this.floatingWindow.isDestroyed()) {
      try {
        safeMethodLog('showFloatingWindow: 设置浮窗位置和显示');
        // 将小浮窗置于鼠标位置附近
        const { screen } = require('electron');
        const point = screen.getCursorScreenPoint();
        // 调整位置，考虑到窗口只有60x60
        this.floatingWindow.setPosition(point.x - 30, point.y - 30);
        this.floatingWindow.show();
        // 移除focus调用，保持用户当前应用的焦点
        safeMethodLog('showFloatingWindow: 浮窗已显示，更新状态');
        this.updateAppState({ floatingWindowVisible: true });

        // 更新数据库设置
        this.safeDatabaseSet('floating_window_enabled', 'true');
        safeMethodLog('showFloatingWindow: 数据库状态已更新为启用');

        // DEBUG: 浮窗内容已正常加载，移除调试代码
      } catch (error) {
        safeMethodLog('Error showing floating window:', error);
        // 如果出错，重新创建浮窗
        this.createFloatingWindow();
        if (this.floatingWindow && !this.floatingWindow.isDestroyed()) {
          this.floatingWindow.show();
          // 移除focus调用，保持用户当前应用的焦点
          this.updateAppState({ floatingWindowVisible: true });
          this.safeDatabaseSet('floating_window_enabled', 'true');
        }
      }
    }
  }

  // 显示浮窗并自动展开到对话模式
  private showFloatingWindowExpanded(): void {
    safeLogger.log('showFloatingWindowExpanded: 开始显示展开的浮窗');

    // 先正常显示浮窗
    this.showFloatingWindow();

    // 等待浮窗准备好后自动展开
    if (this.floatingWindow && !this.floatingWindow.isDestroyed()) {
      // 等待一小段时间确保浮窗完全加载
      setTimeout(() => {
        try {
          // 设置展开的大小和位置
          const expandedWidth = 350;
          const expandedHeight = 500;

          const { screen } = require('electron');
          const point = screen.getCursorScreenPoint();

          // 调整位置确保展开的窗口在屏幕内
          const adjustedX = Math.max(0, Math.min(point.x - 30, screen.getPrimaryDisplay().workAreaSize.width - expandedWidth));
          const adjustedY = Math.max(0, Math.min(point.y - 30, screen.getPrimaryDisplay().workAreaSize.height - expandedHeight));

          this.floatingWindow?.setPosition(adjustedX, adjustedY);
          this.floatingWindow?.setSize(expandedWidth, expandedHeight);
          this.floatingWindow?.setAlwaysOnTop(true, 'screen-saver', 1);

          // 发送展开信号给前端组件
          if (this.floatingWindow && !this.floatingWindow.isDestroyed() && !this.floatingWindow.webContents.isDestroyed()) {
            try {
              this.floatingWindow.webContents.send('expand-floating-window');
              safeLogger.log('showFloatingWindowExpanded: 已发送展开信号给前端组件');
            } catch (error) {
              safeLogger.warn('showFloatingWindowExpanded: 发送展开信号失败:', error);
            }
          }

          safeLogger.log(`showFloatingWindowExpanded: 浮窗已展开为 ${expandedWidth}x${expandedHeight}`);
        } catch (error) {
          safeLogger.error('showFloatingWindowExpanded: 展开浮窗失败:', error);
        }
      }, 500); // 增加延迟确保浮窗React组件完全初始化
    }
  }

  private hideFloatingWindow(): void {
    if (this.floatingWindow && !this.floatingWindow.isDestroyed()) {
      this.floatingWindow.hide();
      this.updateAppState({ floatingWindowVisible: false });
    }
  }

  private registerIpcHandlers(): void {
    // 在开发环境中清理现有的IPC处理器以防止内存泄漏
    if (process.env.NODE_ENV === 'development') {
      ipcMain.removeAllListeners();
    }
    // 创建笔记
    ipcMain.handle('create-note', async (_, input: CreateNoteInput) => {
      try {
        // 获取当前上下文
        const context = await this.contextCapture.getCurrentContext();
        const noteInput = { ...input, context: context || undefined };

        // 保存到数据库
        const note = this.db.createNote(noteInput);

        // 通知主窗口有新笔记创建
        if (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.webContents.isDestroyed()) {
          try {
            this.mainWindow.webContents.send('note-created', note);
          } catch (error) {
            safeLogger.warn('Failed to send note-created event to main window:', error);
          }
        }

        return { success: true, data: note };
      } catch (error) {
        safeLogger.error('Failed to create note:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 获取笔记列表
    ipcMain.handle('get-notes', async (_, limit?: number, offset?: number) => {
      try {
        const notes = this.db.getNotes(limit, offset);
        return { success: true, data: notes };
      } catch (error) {
        safeLogger.error('Failed to get notes:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 获取今日笔记
    ipcMain.handle('get-today-notes', async () => {
      try {
        const notes = this.db.getTodayNotes();
        return { success: true, data: notes };
      } catch (error) {
        safeLogger.error('Failed to get today notes:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 删除笔记
    ipcMain.handle('delete-note', async (_, id: string) => {
      try {
        const success = this.db.deleteNote(id);
        return { success, data: success };
      } catch (error) {
        safeLogger.error('Failed to delete note:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 更新笔记
    ipcMain.handle('update-note', async (_, id: string, text: string) => {
      try {
        const success = this.db.updateNote(id, text);
        return { success, data: success };
      } catch (error) {
        safeLogger.error('Failed to update note:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 更新笔记标签
    ipcMain.handle('update-note-tags', async (_, id: string, tags: string[]) => {
      try {
        const success = this.db.updateNoteTags(id, tags);
        return { success, data: success };
      } catch (error) {
        safeLogger.error('Failed to update note tags:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 更新笔记状态
    ipcMain.handle('update-note-status', async (_, id: string, status: string) => {
      try {
        const success = this.db.updateNoteStatus(id, status);
        return { success, data: success };
      } catch (error) {
        safeLogger.error('Failed to update note status:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // AI内容优化
    ipcMain.handle('optimize-content', async (_, rawContent: string) => {
      try {
        if (!this.aiService) {
          throw new Error('AI服务未配置，请先设置API密钥');
        }

        const optimizedContent = await this.aiService.optimizeContent(rawContent);
        return { success: true, data: optimizedContent };
      } catch (error) {
        safeLogger.error('Failed to optimize content:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 生成每日总结
    ipcMain.handle('generate-daily-digest', async () => {
      try {
        if (!this.aiService) {
          throw new Error('AI服务未配置，请先设置API密钥');
        }

        const notes = this.db.getTodayNotes();
        const digest = await this.aiService.generateDailyDigest(notes);

        return { success: true, data: digest };
      } catch (error) {
        safeLogger.error('Failed to generate daily digest:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 设置AI配置
    ipcMain.handle('set-ai-config', async (_, config: AIConfig) => {
      try {
        // 保存到数据库
        this.db.setSetting('ai_provider', config.provider);
        this.db.setSetting('ai_api_key', config.api_key);
        if (config.model) {
          this.db.setSetting('ai_model', config.model);
        }

        // 重新初始化AI服务
        this.aiService = new AIService(config);

        // 验证配置
        const isValid = await this.aiService.validateConfig();

        return { success: true, data: isValid };
      } catch (error) {
        safeLogger.error('Failed to set AI config:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 获取AI配置
    ipcMain.handle('get-ai-config', async () => {
      try {
        const provider = this.db.getSetting('ai_provider');
        const api_key = this.db.getSetting('ai_api_key');
        const model = this.db.getSetting('ai_model');

        if (!provider || !api_key) {
          return { success: true, data: null };
        }

        return {
          success: true,
          data: { provider, api_key, model } as AIConfig
        };
      } catch (error) {
        safeLogger.error('Failed to get AI config:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 隐藏浮窗
    ipcMain.handle('hide-floating-window', () => {
      this.floatingWindow?.hide();
      // 更新数据库设置
      this.safeDatabaseSet('floating_window_enabled', 'false');
      // 通知主窗口浮窗状态已改变
      if (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.webContents.isDestroyed()) {
        try {
          this.mainWindow.webContents.send('floating-window-state-changed', false);
        } catch (error) {
          safeLogger.warn('Failed to send floating window state change to main window:', error);
        }
      }
    });

    // 显示主窗口
    ipcMain.handle('show-main-window', () => {
      this.showMainWindow();
    });

    // 获取浮窗启用状态
    ipcMain.handle('get-floating-window-enabled', () => {
      try {
        // 检查浮窗是否实际可见和未被销毁
        const windowExists = !!this.floatingWindow;
        const windowNotDestroyed = windowExists && !this.floatingWindow!.isDestroyed();
        const windowIsVisible = windowNotDestroyed && this.floatingWindow!.isVisible();

        safeLogger.log('Floating window status check:', {
          windowExists,
          windowNotDestroyed,
          windowIsVisible
        });

        // 获取数据库中的设置
        const enabledInDb = this.db.getSetting('floating_window_enabled');
        const shouldBeEnabled = enabledInDb !== 'false';

        safeLogger.log('Database setting:', { enabledInDb, shouldBeEnabled });

        // 如果浮窗应该启用但不可见，创建并显示它
        if (shouldBeEnabled && !windowIsVisible) {
          if (!windowExists || !windowNotDestroyed) {
            this.createFloatingWindow();
          } else {
            this.floatingWindow?.show();
          }
          return {
            success: true,
            data: true
          };
        }

        // 返回实际可见状态
        const actuallyEnabled = windowIsVisible && shouldBeEnabled;

        safeLogger.log('Returning floating window status:', actuallyEnabled);

        return {
          success: true,
          data: actuallyEnabled
        };
      } catch (error) {
        safeLogger.error('Failed to get floating window setting:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    // 设置浮窗启用状态
    ipcMain.handle('set-floating-window-enabled', (_, enabled: boolean) => {
      try {
        this.safeDatabaseSet('floating_window_enabled', String(enabled));

        // 立即应用设置
        if (enabled) {
          // 如果浮窗不存在或已被销毁，重新创建
          if (!this.floatingWindow || this.floatingWindow.isDestroyed()) {
            this.createFloatingWindow();
          } else {
            this.floatingWindow.show();
          }
        } else {
          // 确保浮窗真正关闭
          if (this.floatingWindow && !this.floatingWindow.isDestroyed()) {
            this.floatingWindow.hide();
            safeLogger.log('Floating window hidden via set-floating-window-enabled');
          }
        }

        // 通知主窗口浮窗状态已改变
        if (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.webContents.isDestroyed()) {
          try {
            this.mainWindow.webContents.send('floating-window-state-changed', enabled);
          } catch (error) {
            safeLogger.warn('Failed to send floating window state change to main window:', error);
          }
        }

        return { success: true, data: enabled };
      } catch (error) {
        safeLogger.error('Failed to set floating window setting:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    // 调整浮窗大小
    ipcMain.handle('resize-floating-window', (_, width: number, height: number) => {
      safeLogger.log(`FloatingWindow: 收到窗口大小调整请求: ${width}x${height}`);
      if (this.floatingWindow) {
        try {
          // 如果是展开状态(大窗口)，先隐藏主窗口，然后强制置顶浮窗
          if (width > 100 && height > 100) {
            safeLogger.log('FloatingWindow: 展开状态 - 隐藏主窗口并强制置顶浮窗');
            if (this.mainWindow) {
              this.mainWindow.minimize();
            }
            // 强制浮窗置顶并获得焦点
            this.floatingWindow.setAlwaysOnTop(true, 'screen-saver');
            this.floatingWindow.focus();
            this.floatingWindow.moveTop();
          } else {
            safeLogger.log('FloatingWindow: 收起状态 - 恢复正常层级');
            this.floatingWindow.setAlwaysOnTop(true, 'normal');
            if (this.mainWindow && this.mainWindow.isMinimized()) {
              this.mainWindow.restore();
            }
          }

          this.floatingWindow.setSize(width, height);
          const [currentWidth, currentHeight] = this.floatingWindow.getSize();
          safeLogger.log(`FloatingWindow: 窗口大小已调整为: ${currentWidth}x${currentHeight}`);
        } catch (error) {
          safeLogger.error('FloatingWindow: 调整窗口大小失败:', error);
        }
      } else {
        safeLogger.error('FloatingWindow: 浮窗对象不存在，无法调整大小');
      }
    });


    // AI助手对话处理
    ipcMain.handle('process-assistant-chat', async (_, userInput: string) => {
      try {
        if (!this.aiService) {
          throw new Error('AI服务未配置，请先设置API密钥');
        }

        // 获取所有笔记作为上下文
        const notes = this.db.getNotes();

        // 处理AI助手对话
        const response = await this.aiService.processAssistantChat(userInput, notes);

        return { success: true, data: response };
      } catch (error) {
        safeLogger.error('Failed to process assistant chat:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 保存每日总结到历史记录
    ipcMain.handle('save-digest-to-history', async (_, date: string, summary: string) => {
      try {
        const savedDigest = this.db.saveDigest(date, summary);
        return { success: true, data: savedDigest };
      } catch (error) {
        safeLogger.error('Failed to save digest to history:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 获取历史总结列表
    ipcMain.handle('get-saved-digests', async () => {
      try {
        const savedDigests = this.db.getSavedDigests();
        return { success: true, data: savedDigests };
      } catch (error) {
        safeLogger.error('Failed to get saved digests:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 根据日期获取保存的总结
    ipcMain.handle('get-saved-digest-by-date', async (_, date: string) => {
      try {
        const savedDigest = this.db.getSavedDigestByDate(date);
        return { success: true, data: savedDigest };
      } catch (error) {
        safeLogger.error('Failed to get saved digest by date:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 删除保存的总结
    ipcMain.handle('delete-saved-digest', async (_, id: string) => {
      try {
        const result = this.db.deleteSavedDigest(id);
        return { success: true, data: result };
      } catch (error) {
        safeLogger.error('Failed to delete saved digest:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 自定义标签管理 IPC 接口
    ipcMain.handle('create-custom-tag', async (_, name: string, color?: string) => {
      try {
        const result = this.db.createCustomTag(name, color);
        return result;
      } catch (error) {
        safeLogger.error('Failed to create custom tag:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('get-custom-tags', async () => {
      try {
        const tags = this.db.getCustomTags();
        return { success: true, data: tags };
      } catch (error) {
        safeLogger.error('Failed to get custom tags:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('delete-custom-tag', async (_, id: string) => {
      try {
        const success = this.db.deleteCustomTag(id);
        return { success, data: success };
      } catch (error) {
        safeLogger.error('Failed to delete custom tag:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('check-tag-exists', async (_, name: string) => {
      try {
        const exists = this.db.tagExists(name);
        return { success: true, data: exists };
      } catch (error) {
        safeLogger.error('Failed to check tag exists:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
  }

  private initAIService(): void {
    try {
      // 优先使用数据库中的配置
      let provider = this.db.getSetting('ai_provider') as 'openai' | 'qwen';
      let api_key = this.db.getSetting('ai_api_key');
      let model = this.db.getSetting('ai_model');

      // 如果数据库中没有配置，尝试从环境变量读取
      if (!provider || !api_key) {
        provider = (process.env.DEFAULT_AI_PROVIDER as 'openai' | 'qwen') || 'qwen';
        model = process.env.DEFAULT_AI_MODEL || 'qwen-max';

        if (provider === 'qwen' && process.env.QWEN_API_KEY) {
          api_key = process.env.QWEN_API_KEY;
        } else if (provider === 'openai' && process.env.OPENAI_API_KEY) {
          api_key = process.env.OPENAI_API_KEY;
        }

        // 如果从环境变量读取到了配置，保存到数据库中
        if (provider && api_key) {
          this.db.setSetting('ai_provider', provider);
          this.db.setSetting('ai_api_key', api_key);
          if (model) {
            this.db.setSetting('ai_model', model);
          }
          safeLogger.log(`AI配置已从环境变量加载: ${provider} (${model})`);
        }
      }

      if (provider && api_key) {
        this.aiService = new AIService({ provider, api_key, model: model || undefined });
      }
    } catch (error) {
      safeLogger.error('Failed to initialize AI service:', error);
    }
  }

  private handleAppEvents(): void {
    // 当所有窗口都关闭时
    app.on('window-all-closed', () => {
      // 在macOS上，保持应用运行直到用户明确退出
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      // 在macOS上，当应用图标被点击时，显示主窗口
      this.showMainWindow();
    });

    // 应用即将退出时清理资源
    app.on('before-quit', () => {
      globalShortcut.unregisterAll();
      this.db.close();
    });
  }

  // 设置清理任务
  private setupCleanupTasks(): void {
    try {
      // 立即执行一次清理
      const result = this.db.cleanupCompletedNotes();
      if (result.success && result.deletedCount > 0) {
        safeLogger.log(`启动清理完成：删除了 ${result.deletedCount} 条已完成的旧笔记`);
      }

      // 设置每24小时执行一次清理（在每天凌晨2点执行）
      const scheduleNextCleanup = () => {
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 2, 0, 0); // 明天凌晨2点
        const msUntilNextCleanup = tomorrow.getTime() - now.getTime();

        setTimeout(() => {
          try {
            const result = this.db.cleanupCompletedNotes();
            if (result.success && result.deletedCount > 0) {
              safeLogger.log(`定时清理完成：删除了 ${result.deletedCount} 条已完成的旧笔记`);
            }
          } catch (error) {
            safeLogger.error('定时清理失败:', error);
          }

          // 设置下一次清理（24小时后）
          setInterval(() => {
            try {
              const result = this.db.cleanupCompletedNotes();
              if (result.success && result.deletedCount > 0) {
                safeLogger.log(`定时清理完成：删除了 ${result.deletedCount} 条已完成的旧笔记`);
              }
            } catch (error) {
              safeLogger.error('定时清理失败:', error);
            }
          }, 24 * 60 * 60 * 1000); // 24小时
        }, msUntilNextCleanup);
      };

      scheduleNextCleanup();
      safeLogger.log('已完成笔记自动清理任务设置完成（保留期：7天）');

    } catch (error) {
      safeLogger.error('设置清理任务失败:', error);
    }
  }

  // 安全设置数据库的辅助方法
  private safeDatabaseSet(key: string, value: string): void {
    try {
      this.db.setSetting(key, value);
    } catch (error) {
      if (!(error instanceof Error && error.message.includes('The database connection is not open'))) {
        safeLogger.error(`Failed to set ${key} setting:`, error);
      }
    }
  }

  // 新增的快捷键处理方法
  private hideAllWindows(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.hide();
    }
    if (this.floatingWindow && !this.floatingWindow.isDestroyed()) {
      this.floatingWindow.hide();
    }
    safeLogger.log('所有窗口已隐藏');
  }

  private quit(): void {
    safeLogger.log('正在退出应用...');
    app.quit();
  }

  private toggleFloatingWindow(): void {
    if (!this.floatingWindow || this.floatingWindow.isDestroyed()) {
      this.createFloatingWindow();
      this.showFloatingWindow();
      return;
    }

    if (this.floatingWindow.isVisible()) {
      this.hideFloatingWindow();
    } else {
      this.showFloatingWindow();
    }
  }

  private showTodayDigest(): void {
    if (this.mainWindow && this.isInFullScreenEnvironment()) {
      safeLogger.log('showTodayDigest: 检测到全屏环境，只导航不显示以保持全屏体验');
      // 直接发送导航消息，不显示窗口
      if (!this.mainWindow.isDestroyed() && !this.mainWindow.webContents.isDestroyed()) {
        try {
          this.mainWindow.webContents.send('navigate-to-digest');
          safeLogger.log('今日总结页面导航完成（全屏模式）');
        } catch (error) {
          safeLogger.warn('Failed to navigate to digest in fullscreen mode:', error);
        }
      }
      return;
    }

    // 非全屏状态下正常显示
    this.showMainWindow();
    // 向主窗口发送消息，切换到今日总结页面
    if (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.webContents.isDestroyed()) {
      try {
        this.mainWindow.webContents.send('navigate-to-digest');
      } catch (error) {
        safeLogger.warn('Failed to navigate to digest:', error);
      }
    }
    safeLogger.log('显示今日总结');
  }
}

// 确保应用可以在终端关闭后继续运行
function setupProcessDetachment() {
  // 忽略终端相关信号，防止应用意外退出
  process.on('SIGHUP', () => {
    safeLogger.log('收到SIGHUP信号，继续运行...');
  });

  process.on('SIGTERM', () => {
    safeLogger.log('收到SIGTERM信号，继续运行...');
  });

  // 设置进程标题
  process.title = 'Flowpad - AI记事本';

  // 防止意外退出 - 确保应用在后台继续运行
  process.on('uncaughtException', (error) => {
    safeLogger.error('Uncaught Exception:', error);
    // 不退出，继续运行
  });

  process.on('unhandledRejection', (reason, promise) => {
    safeLogger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // 不退出，继续运行
  });
}

// 启动应用
setupProcessDetachment();
const flowpadApp = new FlowpadApp();
flowpadApp.init().catch((error) => safeLogger.error('Failed to initialize Flowpad app:', error));
