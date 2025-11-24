import React, { useState, useEffect } from 'react';
import { Save, Key, Zap, Shield, CheckCircle, AlertCircle, Monitor } from 'lucide-react';
import { AIConfig } from '../../../core/src/index';

const SettingsPanel: React.FC = () => {
  const [aiConfig, setAIConfig] = useState<AIConfig | null>(null);
  const [formData, setFormData] = useState({
    provider: 'qwen' as 'openai' | 'qwen',
    api_key: '',
    model: '',
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [floatingWindowEnabled, setFloatingWindowEnabled] = useState(false);
  const [floatingSaving, setFloatingSaving] = useState(false);

  useEffect(() => {
    loadAIConfig();
    loadFloatingSettings();

    // 监听浮窗状态变化
    const handler = (window as any).electronAPI?.onFloatingWindowStateChanged?.((enabled: boolean) => {
      setFloatingWindowEnabled(enabled);
    });

    // 清理事件监听器
    return () => {
      (window as any).electronAPI?.removeFloatingWindowStateListener?.(handler);
    };
  }, []);

  const loadAIConfig = async () => {
    try {
      const result = await window.electronAPI.getAIConfig();
      if (result.success && result.data) {
        setAIConfig(result.data);
        setFormData({
          provider: result.data.provider,
          api_key: result.data.api_key,
          model: result.data.model || '',
        });
      }
    } catch (error) {
      console.error('Failed to load AI config:', error);
    }
  };

  const loadFloatingSettings = async () => {
    try {
      const result = await (window as any).electronAPI.getFloatingWindowEnabled();
      if (result.success) {
        setFloatingWindowEnabled(result.data !== false); // 默认为true
      }
    } catch (error) {
      console.error('Failed to load floating settings:', error);
      setFloatingWindowEnabled(true); // 默认启用
    }
  };

  const handleFloatingToggle = async (enabled: boolean) => {
    try {
      setFloatingSaving(true);
      const result = await (window as any).electronAPI.setFloatingWindowEnabled(enabled);

      if (result.success) {
        setFloatingWindowEnabled(enabled);
      } else {
        alert('设置失败：' + result.error);
      }
    } catch (error) {
      console.error('Failed to save floating settings:', error);
      alert('设置失败，请重试');
    } finally {
      setFloatingSaving(false);
    }
  };

  const handleSave = async () => {
    if (!formData.api_key.trim()) {
      alert('请输入API密钥');
      return;
    }

    try {
      setSaving(true);
      setTestResult(null);

      const config: AIConfig = {
        provider: formData.provider,
        api_key: formData.api_key.trim(),
        model: formData.model.trim() || undefined,
      };

      const result = await window.electronAPI.setAIConfig(config);

      if (result.success) {
        setAIConfig(config);
        setTestResult({
          success: true,
          message: '设置已保存并验证通过'
        });
      } else {
        setTestResult({
          success: false,
          message: '保存失败：' + result.error
        });
      }
    } catch (error) {
      console.error('Failed to save AI config:', error);
      setTestResult({
        success: false,
        message: '保存失败，请重试'
      });
    } finally {
      setSaving(false);
    }
  };

  const providers = [
    {
      id: 'qwen' as const,
      name: '阿里千问',
      description: '强大功能，中文优化',
      defaultModel: 'qwen-max',
      placeholder: '请输入阿里云API密钥'
    },
    {
      id: 'openai' as const,
      name: 'OpenAI',
      description: '功能强大，英文优先',
      defaultModel: 'gpt-4',
      placeholder: '请输入OpenAI API密钥'
    }
  ];

  const currentProvider = providers.find(p => p.id === formData.provider);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl w-full">
        <div className="mb-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-2">应用设置</h3>
          <p className="text-gray-600">配置AI功能和应用偏好</p>
        </div>

        {/* AI配置部分 */}
        <div className="card p-6 mb-6">
          <div className="flex items-center space-x-2 mb-4">
            <Zap className="w-5 h-5 text-primary-600" />
            <h4 className="text-lg font-semibold text-gray-900">AI功能配置</h4>
          </div>

          <div className="space-y-4">
            {/* 供应商选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                AI供应商
              </label>
              <div className="space-y-2">
                {providers.map((provider) => (
                  <label
                    key={provider.id}
                    className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.provider === provider.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      value={provider.id}
                      checked={formData.provider === provider.id}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          provider: e.target.value as 'openai' | 'qwen',
                          model: provider.defaultModel,
                        });
                      }}
                      className="sr-only"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{provider.name}</div>
                      <div className="text-sm text-gray-500">{provider.description}</div>
                    </div>
                    {formData.provider === provider.id && (
                      <CheckCircle className="w-5 h-5 text-primary-600" />
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* API密钥 */}
            <div>
              <label htmlFor="api-key" className="block text-sm font-medium text-gray-700 mb-2">
                API密钥
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center">
                  <Key className="w-4 h-4 text-gray-400" />
                </div>
                <input
                  id="api-key"
                  type="password"
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  placeholder={currentProvider?.placeholder}
                  className="input-primary pl-10 w-full"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                API密钥仅存储在本地，不会上传到任何服务器
              </p>
            </div>

            {/* 模型选择 */}
            <div>
              <label htmlFor="model" className="block text-sm font-medium text-gray-700 mb-2">
                模型（可选）
              </label>
              <input
                id="model"
                type="text"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder={`默认: ${currentProvider?.defaultModel}`}
                className="input-primary w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                留空将使用默认模型
              </p>
            </div>

            {/* 保存按钮 */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4">
              <div className="flex items-center space-x-2">
                {testResult && (
                  <div className={`flex items-center space-x-2 text-sm ${
                    testResult.success ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {testResult.success ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>

              <button
                onClick={handleSave}
                disabled={saving || !formData.api_key.trim()}
                className="btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed sm:self-end"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{saving ? '保存中...' : '保存设置'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 浮窗设置部分 */}
        <div className="card p-6 mb-6">
          <div className="flex items-center space-x-2 mb-4">
            <Monitor className="w-5 h-5 text-primary-600" />
            <h4 className="text-lg font-semibold text-gray-900">浮窗设置</h4>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  启用浮窗按钮
                </label>
                <p className="text-sm text-gray-500">
                  在屏幕上显示快速记录按钮，可通过拖拽调整位置
                </p>
              </div>
              <div className="flex items-center">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={floatingWindowEnabled}
                    onChange={(e) => handleFloatingToggle(e.target.checked)}
                    disabled={floatingSaving}
                    className="sr-only"
                  />
                  <div className={`w-11 h-6 rounded-full transition-colors duration-200 ease-in-out ${
                    floatingWindowEnabled ? 'bg-primary-600' : 'bg-gray-200'
                  }`}>
                    <div className={`inline-block w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ease-in-out transform ${
                      floatingWindowEnabled ? 'translate-x-6' : 'translate-x-1'
                    } mt-1`}></div>
                  </div>
                </label>
                {floatingSaving && (
                  <div className="ml-2 w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                )}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-sm text-blue-800">
                <div className="font-medium mb-1">快捷键提示：</div>
                <div className="space-y-1">
                  <div>• <kbd className="px-1 py-0.5 bg-blue-100 rounded text-xs">⌥ + N</kbd> 显示快速记录</div>
                  <div>• <kbd className="px-1 py-0.5 bg-blue-100 rounded text-xs">⌥ + M</kbd> 显示主窗口</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 隐私说明 */}
        <div className="card p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Shield className="w-5 h-5 text-green-600" />
            <h4 className="text-lg font-semibold text-gray-900">隐私保护</h4>
          </div>

          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex items-start space-x-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <p>所有笔记数据仅存储在您的本地设备上</p>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <p>API密钥安全保存在本地，不会上传到任何服务器</p>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <p>生成总结时，笔记内容仅发送给您选择的AI供应商</p>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <p>应用上下文信息（应用名、窗口标题等）仅用于本地分类</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;