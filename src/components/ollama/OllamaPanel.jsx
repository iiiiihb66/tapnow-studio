import React, { useState, useRef, useEffect } from 'react';
import { Bot, Sparkles, Send, Image as ImageIcon, X, Loader2, Plus, MessageSquare } from 'lucide-react';

/**
 * OllamaPanel - AI 助手面板
 * 继承了 Tapnow 的深色毛玻璃美学
 */
const OllamaPanel = ({ isOpen, onClose, onAddToCanvas, theme = 'dark' }) => {
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'image'
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '你好！我是您的 AI 助手。我可以帮您理解设计意图，或者直接生成精美的图片素材。' }
  ]);
  const [imagePrompt, setImagePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState([]);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = { role: 'user', content: chatInput };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsGenerating(true);

    try {
      const res = await fetch('/api/ollama/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: chatInput, history: messages.slice(-5) })
      });
      const data = await res.json();
      if (data.ok) {
        const aiMsg = { 
          role: 'assistant', 
          content: data.data.choices?.[0]?.message?.content || 
                   data.data.message?.content || 
                   '抱歉，我没听懂。' 
        };
        setMessages(prev => [...prev, aiMsg]);
      } else {
        throw new Error(data.error || '请求失败');
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ 错误: ${err.message}` }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch('/api/ollama/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt })
      });
      const data = await res.json();
      if (data.ok) {
        // 兼容不同平台的返回格式
        const imgItem = data.data.images?.[0] || data.data.data?.[0]?.url || data.data.data?.[0]?.b64_json;
        if (imgItem) {
          const formattedUrl = imgItem.startsWith('http') || imgItem.startsWith('data:') ? imgItem : `data:image/png;base64,${imgItem}`;
          setGeneratedImages(prev => [formattedUrl, ...prev]);
        }
      } else {
        throw new Error(data.error || '生成失败');
      }
    } catch (err) {
      alert(`生成失败: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed right-20 top-24 bottom-24 w-80 z-50 flex flex-col rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-300 animate-in slide-in-from-right-10 ${
      theme === 'dark' ? 'bg-zinc-900/80 border-zinc-700/50 text-zinc-100' : 'bg-white/80 border-zinc-200/50 text-zinc-900'
    }`}>
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight">AI Lab</div>
            <div className="text-[10px] text-zinc-500">Ollama Powered</div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex p-1 gap-1 bg-black/20 m-3 rounded-xl">
        <button 
          onClick={() => setActiveTab('chat')}
          className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === 'chat' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <MessageSquare className="w-3.5 h-3.5" /> 对话
        </button>
        <button 
          onClick={() => setActiveTab('image')}
          className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === 'image' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <Sparkles className="w-3.5 h-3.5" /> 绘画
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'chat' ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[11px] custom-scrollbar">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] p-3 rounded-2xl leading-relaxed ${
                  msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-800/80 border border-zinc-700/50'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isGenerating && (
              <div className="flex justify-start">
                <div className="bg-zinc-800/50 p-3 rounded-2xl flex items-center gap-2 border border-zinc-700/30">
                  <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                  AI 正在思考...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            <div className="grid grid-cols-2 gap-2">
              {generatedImages.map((url, i) => (
                <div key={i} className="group relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-black/40">
                  <img src={url} className="w-full h-full object-cover" alt="Generated" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all duration-200">
                    <button 
                      onClick={() => onAddToCanvas({ type: 'image', url })}
                      className="p-2 bg-blue-600 rounded-full hover:scale-110 transition-transform shadow-lg"
                      title="添加到画布"
                    >
                      <Plus className="w-5 h-5 text-white" />
                    </button>
                    <span className="text-[10px] mt-2 text-white/80 font-medium">添加到画布</span>
                  </div>
                </div>
              ))}
            </div>
            {!generatedImages.length && !isGenerating && (
              <div className="h-48 flex flex-col items-center justify-center text-zinc-500 gap-3 border-2 border-dashed border-zinc-800/50 rounded-2xl bg-zinc-800/20">
                <ImageIcon className="w-10 h-10 opacity-10" />
                <div className="text-center">
                  <p className="text-[10px] font-medium">输入关键词</p>
                  <p className="text-[9px] opacity-60">开始您的艺术创作</p>
                </div>
              </div>
            )}
            {isGenerating && (
              <div className="h-48 flex flex-col items-center justify-center text-blue-400 gap-3 border border-blue-500/20 rounded-2xl bg-blue-500/5">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-[10px] font-bold animate-pulse">正在绘制中...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-white/5">
        {activeTab === 'chat' ? (
          <div className="relative group">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="问问 AI 你的设计想法..."
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl pl-3 pr-10 py-2.5 text-[11px] outline-none focus:border-blue-500/50 transition-all resize-none h-24"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <button 
              onClick={handleSendMessage}
              disabled={isGenerating || !chatInput.trim()}
              className="absolute right-2 bottom-2 p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all disabled:opacity-30 disabled:grayscale shadow-lg active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              placeholder="描述您想要的图片, 例如: 高质量的 UI 设计元素, 3D 渲染..."
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-3 py-2.5 text-[11px] outline-none focus:border-purple-500/50 transition-all resize-none h-24"
            />
            <button 
              onClick={handleGenerateImage}
              disabled={isGenerating || !imagePrompt.trim()}
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-500 hover:to-purple-500 transition-all text-[11px] font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg active:scale-[0.98]"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              开始 AI 绘画
            </button>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}} />
    </div>
  );
};

export default OllamaPanel;
