export function setupVoice({ getText, setText, onStatus, getOutputEnabled }) {
  const button = document.querySelector('#voiceBtn');
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  if (Recognition) {
    recognition = new Recognition(); recognition.lang = navigator.language || 'en-US'; recognition.interimResults = true; recognition.continuous = false;
    recognition.onstart = () => { button.classList.add('recording'); onStatus?.('Listening…'); };
    recognition.onend = () => { button.classList.remove('recording'); onStatus?.(''); };
    recognition.onerror = () => { button.classList.remove('recording'); onStatus?.('Voice input unavailable.'); };
    recognition.onresult = event => { let final = ''; for (let i = event.resultIndex; i < event.results.length; i++) final += event.results[i][0].transcript; setText(`${getText()} ${final}`.trim()); };
    button.addEventListener('click', () => { try { recognition.start(); } catch { recognition.stop(); } });
  } else {
    button.disabled = true; button.title = 'Speech recognition is not supported here.';
  }
  return {
    speak(text) { if (!getOutputEnabled()) return; if (!('speechSynthesis' in window)) return; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.slice(0, 8000)); u.rate = 1; u.pitch = 1; speechSynthesis.speak(u); },
  };
}
