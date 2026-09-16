import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/vietnamese-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/vietnamese-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/vietnamese-600.css';
import '@fontsource/lora/latin-400.css';
import '@fontsource/lora/vietnamese-400.css';
import '@fontsource/lora/latin-400-italic.css';
import '@fontsource/lora/vietnamese-400-italic.css';
import App from './App.jsx';
import './styles.css';
import './motion.css';
import './tree-canvas.css';
import { apDung } from './theme.js';
import { khoiDong as khoiDongChuyenDong } from './motion.js';

// Đặt giao diện trước khi React dựng cây, để không loé một nhịp sai màu rồi mới đổi.
apDung();
// Và quyết chuyện chuyển động trước khi có gì kịp chuyển động: ai đã xin máy giảm
// chuyển động thì mở ra phải thấy một trang đứng yên, không phải thấy nó chạy một
// nhịp rồi mới dừng lại.
khoiDongChuyenDong();

class ErrorBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) return <main className="fatal"><h1>Đỗ Gia cần tải lại một chút.</h1><p>Dữ liệu đã lưu trên máy chủ vẫn được giữ nguyên.</p><button onClick={() => location.reload()}>Tải lại trang</button></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);

// Only in a real build: a worker registered against the dev server would cache Vite's
// unhashed module URLs. Registration failing is not worth bothering the family about.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
