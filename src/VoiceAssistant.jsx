import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, MessageCircle, Mic, MicOff, PhoneOff, Send, Sparkles, Volume2, X } from 'lucide-react';
import './voice-assistant.css';

function getMicError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
    return 'माइक की अनुमति नहीं मिली। अपने ब्राउज़र की साइट सेटिंग्स में माइक्रोफ़ोन चालू करके फिर कोशिश करें।';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return 'कोई माइक्रोफ़ोन नहीं मिला। माइक्रोफ़ोन कनेक्ट करके फिर कोशिश करें।';
  }
  if (error?.name === 'NotReadableError') return 'माइक्रोफ़ोन किसी दूसरे ऐप में इस्तेमाल हो रहा है। उसे बंद करके फिर कोशिश करें।';
  return 'आवाज़ शुरू नहीं हो पाई। कृपया दोबारा कोशिश करें।';
}

export default function VoiceAssistant() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('idle');
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const peerRef = useRef(null);
  const streamRef = useRef(null);
  const channelRef = useRef(null);
  const audioRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  function stopSession(resetStatus = true) {
    channelRef.current?.close();
    channelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    setMuted(false);
    if (resetStatus) setStatus('idle');
  }

  useEffect(() => () => stopSession(false), []);

  function upsertAssistantMessage(id, text, append = false) {
    setMessages((current) => {
      const index = current.findIndex((message) => message.id === id);
      if (index < 0) return [...current, { id, role: 'assistant', text }];
      const next = [...current];
      next[index] = { ...next[index], text: append ? next[index].text + text : text };
      return next;
    });
  }

  async function startSession() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      setError('इस ब्राउज़र में WebRTC माइक्रोफ़ोन उपलब्ध नहीं है। नवीनतम Chrome, Edge या Safari इस्तेमाल करें।');
      setStatus('error');
      return;
    }
    setStatus('connecting');
    let stream;
    let peer;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      peer = new RTCPeerConnection();
      peerRef.current = peer;
      peer.ontrack = (event) => {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0];
          audioRef.current.play().catch(() => {});
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
          setError('आवाज़ का कनेक्शन टूट गया। फिर से शुरू करके देखें।');
          stopSession();
          setStatus('error');
        }
      };
      stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));

      const channel = peer.createDataChannel('oai-events');
      channelRef.current = channel;
      channel.onopen = () => setStatus('listening');
      channel.onerror = () => {
        setError('Realtime कनेक्शन में समस्या आई। API सेटअप जाँचकर फिर कोशिश करें।');
        stopSession();
        setStatus('error');
      };
      channel.onmessage = (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        switch (message.type) {
          case 'input_audio_buffer.speech_started':
            setStatus('listening');
            break;
          case 'response.created':
            setStatus('thinking');
            break;
          case 'output_audio_buffer.started':
            setStatus('speaking');
            break;
          case 'output_audio_buffer.stopped':
          case 'response.done':
            setStatus('listening');
            break;
          case 'conversation.item.input_audio_transcription.completed':
            if (message.transcript?.trim()) {
              setMessages((current) => [...current, { id: message.item_id || crypto.randomUUID(), role: 'user', text: message.transcript.trim() }]);
            }
            break;
          case 'response.output_audio_transcript.delta':
            if (message.delta) upsertAssistantMessage(message.item_id || message.response_id || crypto.randomUUID(), message.delta, true);
            break;
          case 'response.output_audio_transcript.done':
            if (message.transcript?.trim()) upsertAssistantMessage(message.item_id || message.response_id, message.transcript.trim());
            break;
          case 'error':
            setError(message.error?.message || 'Realtime आवाज़ सेवा में समस्या आई।');
            break;
          default:
            break;
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch('/api/realtime/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'सर्वर से आवाज़ सत्र शुरू नहीं हो सका।');
      }
      const answer = { type: 'answer', sdp: await response.text() };
      await peer.setRemoteDescription(answer);
    } catch (cause) {
      stopSession();
      setError(cause instanceof DOMException
        ? getMicError(cause)
        : cause instanceof TypeError && cause.message.includes('fetch')
        ? 'सर्वर से संपर्क नहीं हो पाया। सुनिश्चित करें कि npm run dev चल रहा है।'
        : cause.message || 'आवाज़ शुरू नहीं हो पाई।');
      setStatus('error');
    }
  }

  function toggleMute() {
    const nextMuted = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setMuted(nextMuted);
  }

  function sendText(event) {
    event.preventDefault();
    const text = draft.trim();
    const channel = channelRef.current;
    if (!text || channel?.readyState !== 'open') return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text }]);
    channel.send(JSON.stringify({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    }));
    channel.send(JSON.stringify({ type: 'response.create', response: { output_modalities: ['audio'] } }));
    setDraft('');
    setStatus('thinking');
  }

  const statusText = {
    idle: 'बात करने के लिए आवाज़ शुरू करें',
    connecting: 'कनेक्ट हो रहा है…',
    listening: muted ? 'माइक म्यूट है' : 'सुन रहा हूँ…',
    thinking: 'जवाब सोच रहा हूँ…',
    speaking: 'जवाब दे रहा हूँ…',
    error: 'कनेक्शन में समस्या',
  }[status];
  const active = ['listening', 'thinking', 'speaking'].includes(status);

  return <>
    {open && <section className="voice-panel" role="dialog" aria-modal="false" aria-labelledby="voice-title">
      <header className="voice-header">
        <span className="voice-brand-icon"><Sparkles size={18}/></span>
        <span className="voice-heading"><b id="voice-title">महाराष्ट्र ट्रैवल गाइड</b><small><i className={`voice-status-dot ${status}`}/>{statusText}</small></span>
        <button className="voice-icon-button" type="button" aria-label="पैनल बंद करें" onClick={() => { stopSession(); setOpen(false); }}><X size={19}/></button>
      </header>
      <div className="voice-messages" ref={listRef} aria-live="polite">
        <div className="voice-welcome"><Sparkles size={15}/><span>नमस्ते! महाराष्ट्र की यात्रा की योजना बनाने में मैं आपकी मदद कर सकता हूँ। हिंदी, Hinglish या English में पूछें।</span></div>
        {messages.map((message) => <div className={`voice-message ${message.role}`} key={message.id}>
          {message.role === 'assistant' && <span className="voice-message-mark"><Sparkles size={12}/></span>}
          <p>{message.text}</p>
        </div>)}
        {status === 'thinking' && <div className="voice-thinking"><i/><i/><i/></div>}
      </div>
      {error && <div className="voice-error" role="alert">{error}</div>}
      <form className="voice-compose" onSubmit={sendText}>
        <input aria-label="अपना संदेश लिखें" placeholder="अपना संदेश लिखें…" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!active}/>
        <button type="submit" aria-label="संदेश भेजें" disabled={!active || !draft.trim()}><Send size={17}/></button>
      </form>
      <div className="voice-controls">
        {active ? <>
          <button className={`voice-mic ${muted ? 'muted' : ''}`} type="button" onClick={toggleMute} aria-label={muted ? 'माइक चालू करें' : 'माइक म्यूट करें'}>{muted ? <MicOff size={18}/> : <Mic size={18}/>}<span>{muted ? 'Unmute' : 'Mute'}</span></button>
          <span className={`voice-activity ${status}`} aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/></span>
          <button className="voice-stop" type="button" onClick={() => { stopSession(); setError(''); }} aria-label="आवाज़ बंद करें"><PhoneOff size={17}/><span>Stop</span></button>
        </> : <button className="voice-start" type="button" onClick={startSession} disabled={status === 'connecting'}>
          {status === 'connecting' ? <LoaderCircle className="voice-spinner" size={18}/> : <Mic size={18}/>}
          {status === 'error' ? 'फिर कोशिश करें' : status === 'connecting' ? 'कनेक्ट हो रहा है…' : 'आवाज़ से बात करें'}
        </button>}
      </div>
      <p className="voice-footnote">आवाज़ शुरू करने पर आपका ब्राउज़र माइक की अनुमति माँगेगा।</p>
      <audio ref={audioRef} autoPlay playsInline className="voice-audio"/>
    </section>}
    <button className={`voice-launcher ${open ? 'open' : ''}`} type="button" onClick={() => { if (open) stopSession(); setOpen((value) => !value); }} aria-label={open ? 'आवाज़ सहायक बंद करें' : 'हिंदी आवाज़ सहायक खोलें'} aria-expanded={open}>
      {open ? <X size={23}/> : <><MessageCircle size={21}/><span>हिंदी में पूछें</span></>}
      {!open && <span className="voice-launcher-pulse"/>}
    </button>
  </>;
}
