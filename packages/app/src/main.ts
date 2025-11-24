import { app, BrowserWindow, globalShortcut, ipcMain, Menu, Tray, nativeImage } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { FlowpadDB, ContextCapture, AIService, CreateNoteInput, AIConfig } from '../../core/dist/index';

// 加载.env文件（如果存在）
dotenv.config({ path: path.join(__dirname, '../../../.env') });

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
        console.warn('Failed to broadcast state change to main window:', error);
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
    console.log(`开机自启动${newAutoStartEnabled ? '已开启' : '已关闭'}`);
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
      console.log('另一个实例已经在运行，退出当前实例');
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
      console.log('MainWindow: 尝试加载窗口图标:', iconPath);
      windowIcon = nativeImage.createFromPath(iconPath);
      if (windowIcon.isEmpty()) {
        throw new Error('Icon file not found');
      }
      console.log('MainWindow: 窗口图标加载成功');
    } catch (error) {
      console.log('MainWindow: 窗口图标加载失败，使用默认图标');
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

    // 安全日志方法，避免EPIPE错误
    const safeLog = (message: string, ...args: any[]) => {
      try {
        if (this.floatingWindow && !this.floatingWindow.isDestroyed()) {
          console.log(message, ...args);
        }
      } catch (error) {
        // 静默处理EPIPE错误和其他写入错误，避免应用崩溃
      }
    };

    // Debug: 监听浮窗控制台消息，添加错误处理
    this.floatingWindow.webContents.on('console-message', (event, level, message) => {
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
      const enabled = this.db.getSetting('floating_window_enabled');
      safeLog('FloatingWindow: 数据库设置:', enabled);

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
          console.warn('Failed to send floating window close state to main window:', error);
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
          console.warn('Failed to send floating window hide state to main window:', error);
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
          console.warn('Failed to send floating window show state to main window:', error);
        }
      }
    });
  }

  private registerGlobalShortcuts(): void {
    // 注册 Option+N 快捷键显示浮窗
    globalShortcut.register('Option+N', () => {
      this.showFloatingWindow();
    });

    // 注册 Option+M 快捷键显示主窗口
    globalShortcut.register('Option+M', () => {
      this.showMainWindow();
    });

    // 注册 Option+H 快捷键隐藏所有窗口
    globalShortcut.register('Option+H', () => {
      this.hideAllWindows();
    });

    // 注册 Option+Q 快捷键退出应用
    globalShortcut.register('Option+Q', () => {
      this.quit();
    });

    // 注册 Option+T 快捷键切换浮窗显示状态
    globalShortcut.register('Option+T', () => {
      this.toggleFloatingWindow();
    });

    // 注册 Option+D 快捷键显示今日总结
    globalShortcut.register('Option+D', () => {
      this.showTodayDigest();
    });

    console.log('已注册全局快捷键:');
    console.log('  Option+N: 显示快速记录窗口');
    console.log('  Option+M: 显示主窗口');
    console.log('  Option+H: 隐藏所有窗口');
    console.log('  Option+Q: 退出应用');
    console.log('  Option+T: 切换浮窗状态');
    console.log('  Option+D: 显示今日总结');
  }

  private createTray(): void {
    // 创建托盘图标（使用内置的模板或从数据URL创建）
    let trayIcon;
    try {
      // 尝试加载自定义图标
      const iconPath = path.join(__dirname, 'assets/icon.png');
      console.log('Tray: 尝试加载图标路径:', iconPath);
      console.log('Tray: __dirname =', __dirname);

      trayIcon = nativeImage.createFromPath(iconPath);
      console.log('Tray: 图标是否为空:', trayIcon.isEmpty());

      // 如果图标为空，使用简单的模板图标
      if (trayIcon.isEmpty()) {
        throw new Error('Custom icon not found');
      }
      console.log('Tray: 自定义图标加载成功');
    } catch (error) {
      console.log('Tray: 自定义图标加载失败:', (error as Error).message);
      // 使用简单的模板图标 - 创建一个16x16的小图标
      trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA8klEQVR4nL2TMQ7CMAwF3yYVEhNiY2VgYGJgQEysDCxMrOwsLCwsrCwsLCwsrCwsLCwsDCwMbCxMrOxdJW1Sg/wl/8nJ+98vJgQhCEFIkmRJkiRJkiT9AzDGEEKIMYYxxhhjjDH2t2CtZYwxxhhjjDHGGGP/ADDGEEKIMcYYY4wxxhj7G7DWMsYYY4wxxhhjjLF/AICIiIiIiIiIiOgfQkSUJEmSJEmSJEn/ACIiotYwxhhjjDHG2N+AtZYxxhhjjDHGGGP/AIiIqDWMMcYYY4wx9jdgrWWMMcYYY4wxxv4BAFprbW2ttbbW2lprrd0DAACAENELS5Lk1y8AAAAASUVORK5CYII=');
      console.log('Tray: 使用备用的内置图标');
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
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
      this.updateAppState({ mainWindowVisible: true });
    }
  }

  private showFloatingWindow(): void {
    // 安全日志方法，避免EPIPE错误
    const safeMethodLog = (message: string, ...args: any[]) => {
      try {
        console.log(message, ...args);
      } catch (error) {
        // 静默处理EPIPE错误
      }
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
            console.warn('Failed to send note-created event to main window:', error);
          }
        }

        return { success: true, data: note };
      } catch (error) {
        console.error('Failed to create note:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 获取笔记列表
    ipcMain.handle('get-notes', async (_, limit?: number, offset?: number) => {
      try {
        const notes = this.db.getNotes(limit, offset);
        return { success: true, data: notes };
      } catch (error) {
        console.error('Failed to get notes:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 获取今日笔记
    ipcMain.handle('get-today-notes', async () => {
      try {
        const notes = this.db.getTodayNotes();
        return { success: true, data: notes };
      } catch (error) {
        console.error('Failed to get today notes:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 删除笔记
    ipcMain.handle('delete-note', async (_, id: string) => {
      try {
        const success = this.db.deleteNote(id);
        return { success, data: success };
      } catch (error) {
        console.error('Failed to delete note:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 更新笔记
    ipcMain.handle('update-note', async (_, id: string, text: string) => {
      try {
        const success = this.db.updateNote(id, text);
        return { success, data: success };
      } catch (error) {
        console.error('Failed to update note:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 更新笔记标签
    ipcMain.handle('update-note-tags', async (_, id: string, tags: string[]) => {
      try {
        const success = this.db.updateNoteTags(id, tags);
        return { success, data: success };
      } catch (error) {
        console.error('Failed to update note tags:', error);
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
        console.error('Failed to optimize content:', error);
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
        console.error('Failed to generate daily digest:', error);
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
        console.error('Failed to set AI config:', error);
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
        console.error('Failed to get AI config:', error);
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
          console.warn('Failed to send floating window state change to main window:', error);
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

        console.log('Floating window status check:', {
          windowExists,
          windowNotDestroyed,
          windowIsVisible
        });

        // 获取数据库中的设置
        const enabledInDb = this.db.getSetting('floating_window_enabled');
        const shouldBeEnabled = enabledInDb !== 'false';

        console.log('Database setting:', { enabledInDb, shouldBeEnabled });

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

        console.log('Returning floating window status:', actuallyEnabled);

        return {
          success: true,
          data: actuallyEnabled
        };
      } catch (error) {
        console.error('Failed to get floating window setting:', error);
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
            console.log('Floating window hidden via set-floating-window-enabled');
          }
        }

        // 通知主窗口浮窗状态已改变
        if (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.webContents.isDestroyed()) {
          try {
            this.mainWindow.webContents.send('floating-window-state-changed', enabled);
          } catch (error) {
            console.warn('Failed to send floating window state change to main window:', error);
          }
        }

        return { success: true, data: enabled };
      } catch (error) {
        console.error('Failed to set floating window setting:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    // 调整浮窗大小
    ipcMain.handle('resize-floating-window', (_, width: number, height: number) => {
      console.log(`FloatingWindow: 收到窗口大小调整请求: ${width}x${height}`);
      if (this.floatingWindow) {
        try {
          // 如果是展开状态(大窗口)，先隐藏主窗口，然后强制置顶浮窗
          if (width > 100 && height > 100) {
            console.log('FloatingWindow: 展开状态 - 隐藏主窗口并强制置顶浮窗');
            if (this.mainWindow) {
              this.mainWindow.minimize();
            }
            // 强制浮窗置顶并获得焦点
            this.floatingWindow.setAlwaysOnTop(true, 'screen-saver');
            this.floatingWindow.focus();
            this.floatingWindow.moveTop();
          } else {
            console.log('FloatingWindow: 收起状态 - 恢复正常层级');
            this.floatingWindow.setAlwaysOnTop(true, 'normal');
            if (this.mainWindow && this.mainWindow.isMinimized()) {
              this.mainWindow.restore();
            }
          }

          this.floatingWindow.setSize(width, height);
          const [currentWidth, currentHeight] = this.floatingWindow.getSize();
          console.log(`FloatingWindow: 窗口大小已调整为: ${currentWidth}x${currentHeight}`);
        } catch (error) {
          console.error('FloatingWindow: 调整窗口大小失败:', error);
        }
      } else {
        console.error('FloatingWindow: 浮窗对象不存在，无法调整大小');
      }
    });

    // 移动浮窗位置
    ipcMain.handle('move-floating-window', (_, x: number, y: number) => {
      if (this.floatingWindow) {
        // 确保窗口位置不会超出屏幕边界
        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { bounds } = primaryDisplay;

        // 限制在屏幕范围内
        const clampedX = Math.max(0, Math.min(x, bounds.width - 60));
        const clampedY = Math.max(0, Math.min(y, bounds.height - 60));

        this.floatingWindow.setPosition(clampedX, clampedY);
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
        console.error('Failed to process assistant chat:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 保存每日总结到历史记录
    ipcMain.handle('save-digest-to-history', async (_, date: string, summary: string) => {
      try {
        const savedDigest = this.db.saveDigest(date, summary);
        return { success: true, data: savedDigest };
      } catch (error) {
        console.error('Failed to save digest to history:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 获取历史总结列表
    ipcMain.handle('get-saved-digests', async () => {
      try {
        const savedDigests = this.db.getSavedDigests();
        return { success: true, data: savedDigests };
      } catch (error) {
        console.error('Failed to get saved digests:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 根据日期获取保存的总结
    ipcMain.handle('get-saved-digest-by-date', async (_, date: string) => {
      try {
        const savedDigest = this.db.getSavedDigestByDate(date);
        return { success: true, data: savedDigest };
      } catch (error) {
        console.error('Failed to get saved digest by date:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // 删除保存的总结
    ipcMain.handle('delete-saved-digest', async (_, id: string) => {
      try {
        const result = this.db.deleteSavedDigest(id);
        return { success: true, data: result };
      } catch (error) {
        console.error('Failed to delete saved digest:', error);
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
          console.log(`AI配置已从环境变量加载: ${provider} (${model})`);
        }
      }

      if (provider && api_key) {
        this.aiService = new AIService({ provider, api_key, model: model || undefined });
      }
    } catch (error) {
      console.error('Failed to initialize AI service:', error);
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

  // 安全设置数据库的辅助方法
  private safeDatabaseSet(key: string, value: string): void {
    try {
      this.db.setSetting(key, value);
    } catch (error) {
      if (!(error instanceof Error && error.message.includes('The database connection is not open'))) {
        console.error(`Failed to set ${key} setting:`, error);
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
    console.log('所有窗口已隐藏');
  }

  private quit(): void {
    console.log('正在退出应用...');
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
    this.showMainWindow();
    // 向主窗口发送消息，切换到今日总结页面
    if (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.webContents.isDestroyed()) {
      try {
        this.mainWindow.webContents.send('navigate-to-digest');
      } catch (error) {
        console.warn('Failed to navigate to digest:', error);
      }
    }
    console.log('显示今日总结');
  }
}

// 启动应用
const flowpadApp = new FlowpadApp();
flowpadApp.init().catch(console.error);