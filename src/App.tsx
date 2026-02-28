import React, { useState, useEffect, useRef } from "react";
import { Peer, DataConnection } from "peerjs";
import {
  Send,
  Paperclip,
  LogOut,
  Download,
  Plus,
  Share2,
  ShieldCheck,
  User,
  ChevronRight,
  File as FileIcon,
  Image as ImageIcon,
  Video as VideoIcon,
  FolderOpen,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  X,
  MessagesSquare,
  Zap,
  Lock,
  MessageCircle,
  Activity,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Persistent unique ID
const MY_ID = localStorage.getItem("ppchat-client-id") || Math.random().toString(36).substring(2, 15);
localStorage.setItem("ppchat-client-id", MY_ID);

interface Message {
  id: string;
  sender: string;
  senderId: string;
  text?: string;
  file?: {
    name: string;
    type: string;
    data: any;
    size?: number;
    previewUrl?: string;
    folderPath?: string;
  };
  timestamp: number;
  type?: "system";
  systemType?: "join" | "leave" | "error";
}

// Global Ad Widget - Floating Bottom Right
const AdWidget = () => (
  <div className="fixed bottom-4 right-4 z-[100] pointer-events-auto">
    <ins className="eas6a97888e6" data-zoneid="5861218" data-ex_av="name"></ins>
  </div>
);

export default function App() {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [connections, setConnections] = useState<DataConnection[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [username, setUsername] = useState<string>(localStorage.getItem("ppchat-username") || "");
  const [roomName, setRoomName] = useState<string>("");
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fullPreviewUrl, setFullPreviewUrl] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("ppchat-username", username);
  }, [username]);

  // Handle ExoClick Ad delivery
  useEffect(() => {
    try {
      // @ts-ignore
      (window.AdProvider = window.AdProvider || []).push({ "serve": {} });
    } catch (e) { }
  }, [isConnected]);

  const processFileMessage = (msg: Message) => {
    if (msg.file && msg.file.data && !msg.file.previewUrl) {
      const blob = createBlob(msg.file.data, msg.file.type);
      if (blob) {
        msg.file.previewUrl = URL.createObjectURL(blob);
      }
    }
    return msg;
  };

  const addMessage = (msg: Message) => {
    const processedMsg = processFileMessage(msg);
    setMessages((prev) => (prev.find(m => m.id === processedMsg.id) ? prev : [...prev, processedMsg]));
  };

  const createBlob = (data: any, type: string) => {
    if (data instanceof Blob) return data;
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new Blob([data as any], { type });
    if (typeof data === "string" && data.startsWith("data:")) {
      const parts = data.split(",");
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) u8arr[n] = bstr.charCodeAt(n);
      return new Blob([u8arr], { type: parts[0].split(":")[1].split(";")[0] });
    }
    if (data && typeof data === 'object') {
      try { return new Blob([data as any], { type }); } catch (e) { return null; }
    }
    return null;
  };

  const broadcast = (msg: Message, excludeConns: DataConnection[] = []) => {
    connections.forEach(conn => {
      if (!excludeConns.some(e => e.peer === conn.peer)) conn.send(msg);
    });
  };

  const handleReceivedData = (data: any, fromConn: DataConnection) => {
    const msg = data as Message;
    const cleanMsg = { ...msg, file: msg.file ? { ...msg.file, previewUrl: undefined } : undefined };
    addMessage(cleanMsg);
    if (isHost) broadcast(msg, [fromConn]);
  };

  const setupPeer = (id?: string) => {
    setError(null);
    setIsConnecting(true);

    // Cleanup existing peer
    if (peer) {
      peer.destroy();
    }

    const config = {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ]
      }
    };

    const newPeer = id ? new Peer(id, config) : new Peer(config);

    newPeer.on("open", () => {
      if (id) {
        setIsConnected(true);
        setIsConnecting(false);
        setCurrentRoom(roomName.trim() || id.replace('ppchat-rm-', ''));
        setIsHost(true);
      }
    });

    newPeer.on("connection", (conn) => {
      conn.on("open", () => {
        setConnections(prev => {
          if (prev.find(c => c.peer === conn.peer)) return prev;
          return [...prev, conn];
        });
        addMessage({
          id: `sys-${Date.now()}`,
          sender: "System",
          senderId: "system",
          text: `A peer initialised`,
          timestamp: Date.now(),
          type: "system"
        });
      });
      conn.on("data", (data) => handleReceivedData(data, conn));
      conn.on("close", () => {
        setConnections(prev => prev.filter(c => c.peer !== conn.peer));
      });
    });

    newPeer.on("error", (err) => {
      console.error("Peer error:", err);
      setIsConnecting(false);
      setError(err.type === "unavailable-id" ? "Room busy or taken." : `Protocol error: ${err.type}`);
    });

    setPeer(newPeer);
    return newPeer;
  };

  const handleJoinOrCreate = (type: "host" | "join", overrideRoom?: string) => {
    const roomToUse = overrideRoom || roomName;
    if (!roomToUse.trim()) { setError("Enter room name"); return; }
    const roomId = `ppchat-rm-${roomToUse.trim().toLowerCase()}`;

    if (type === "host") {
      setupPeer(roomId);
    } else {
      setIsConnecting(true);
      const guestPeer = setupPeer();

      const connectionTimeout = setTimeout(() => {
        if (!isConnected) {
          setError("Connection timeout. Host may be offline or blocked.");
          setIsConnecting(false);
          guestPeer.destroy();
        }
      }, 15000);

      guestPeer.on("open", () => {
        const conn = guestPeer.connect(roomId);

        conn.on("open", () => {
          clearTimeout(connectionTimeout);
          setIsConnected(true);
          setIsConnecting(false);
          setIsHost(false);
          setCurrentRoom(roomToUse.trim());
          setConnections([conn]);
          conn.send({
            id: `sys-join-${Date.now()}`,
            sender: username.trim() || "Anonymous",
            senderId: MY_ID,
            text: `${username.trim() || "Anonymous"} syncronised`,
            timestamp: Date.now(),
            type: "system"
          });
        });

        conn.on("data", (data) => handleReceivedData(data, conn));
        conn.on("close", () => {
          setIsConnected(false);
          setError("Disconnected from host.");
        });
        conn.on("error", (err) => {
          console.error("Conn error:", err);
          setError("Handshake failed.");
          setIsConnecting(false);
          clearTimeout(connectionTimeout);
        });
      });

      guestPeer.on("error", (err) => {
        if (err.type === 'peer-unavailable') {
          setError("Room not found / unavailable.");
          clearTimeout(connectionTimeout);
        }
      });
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    if (roomParam && !isConnected && !isConnecting) {
      setRoomName(roomParam);
      handleJoinOrCreate("join", roomParam);
    }
  }, []);

  const sendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !peer) return;
    const currentName = username.trim() || "Anonymous";
    const msg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender: currentName,
      senderId: MY_ID,
      text: inputText.trim(),
      timestamp: Date.now(),
    };
    addMessage(msg);
    if (isHost) broadcast(msg); else connections[0]?.send(msg);
    setInputText("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !peer) return;
    const currentName = username.trim() || "Anonymous";
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const msg: Message = {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sender: currentName,
        senderId: MY_ID,
        file: {
          name: file.name,
          type: file.type || "application/octet-stream",
          data: file,
          size: file.size,
          folderPath: (file as any).webkitRelativePath || ""
        },
        timestamp: Date.now(),
      };
      addMessage(msg);
      if (isHost) broadcast(msg); else connections[0]?.send(msg);
    }
    if (e.target) e.target.value = "";
  };

  const downloadFile = (file: any) => {
    const blob = createBlob(file.data, file.type);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyRoomName = () => {
    if (!currentRoom) return;
    const url = new URL(window.location.href);
    url.searchParams.set("room", currentRoom);
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getFileIcon = (type: string) => {
    if (type.includes("image")) return <ImageIcon className="w-4 h-4 text-emerald-400" />;
    if (type.includes("video")) return <VideoIcon className="w-4 h-4 text-teal-400" />;
    return <FileIcon className="w-4 h-4 text-slate-500" />;
  };

  const BgEffect = () => (
    <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10 bg-[#050912]">
      {/* Mesh/Gradient Simulation */}
      <div className="absolute top-[-20%] left-[-10%] w-[120%] h-[120%] bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.1),transparent_50%)]" />
      <div className="absolute top-[20%] right-[-20%] w-[80%] h-[80%] bg-[radial-gradient(circle_at_100%_50%,rgba(0,121,107,0.15),transparent_60%)]" />
      <div className="absolute bottom-[-10%] left-[-20%] w-[70%] h-[70%] bg-[radial-gradient(circle_at_0%_100%,rgba(255,255,255,0.03),transparent_50%)]" />

      {/* Subtle Pattern Grid */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />

      {/* Deep overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050912]/40 to-[#050912]" />
    </div>
  );

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 relative font-sans overflow-hidden">
        <BgEffect />
        <AdWidget />

        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm z-10">
          <div className="bg-[#0c1321]/95 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_40px_120px_rgba(0,0,0,0.9)] border-[3px] border-slate-800 p-8 sm:p-9 text-center">
            <div className="flex flex-col items-center mb-10">
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-2xl border-2 border-emerald-500/20 mb-4">
                <MessagesSquare className="text-black w-7 h-7" />
              </div>
              <h1 className="text-2xl font-black text-white tracking-widest uppercase">PPChat</h1>
              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.5em] mt-1">P2P Communication</p>
            </div>

            <div className="space-y-5">
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 ml-1">Identity Tag</label>
                <input
                  type="text" placeholder="Your name..." value={username} onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-black/60 border-[3px] border-slate-700/50 rounded-2xl py-4 px-6 outline-none text-white text-base font-bold focus:border-emerald-500/50 transition-all placeholder:text-slate-800"
                />
              </div>
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 ml-1">Room Protocol</label>
                <input
                  type="text" placeholder="Entry code..." value={roomName} onChange={(e) => setRoomName(e.target.value)}
                  className="w-full bg-black/60 border-[3px] border-slate-700/50 rounded-2xl py-4 px-6 outline-none text-white text-base font-bold focus:border-emerald-500/50 transition-all placeholder:text-slate-800"
                />
              </div>

              {error && <div className="text-rose-400 text-xs font-bold bg-rose-500/10 p-3 rounded-xl border-2 border-rose-500/20">{error}</div>}

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleJoinOrCreate("host")}
                  disabled={isConnecting}
                  className="bg-white text-black py-4.5 rounded-[1.8rem] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-100 active:scale-95 border-b-4 border-slate-300 disabled:opacity-50"
                >
                  {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                  <span>Host</span>
                </button>
                <button
                  onClick={() => handleJoinOrCreate("join")}
                  disabled={isConnecting}
                  className="bg-emerald-600 text-white py-4.5 rounded-[1.8rem] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-500 active:scale-95 border-b-4 border-emerald-800 disabled:opacity-50"
                >
                  {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-5 h-5" />}
                  <span>Join</span>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col font-sans overflow-hidden">
      <BgEffect />
      <AdWidget />

      <header className="bg-[#0c1321]/95 backdrop-blur-2xl border-b-[3px] border-emerald-500/30 px-4 sm:px-10 py-5 flex items-center justify-between z-20 shrink-0 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 bg-white rounded-xl flex items-center justify-center border-2 border-emerald-500/20 shadow-xl">
            <MessagesSquare className="text-black w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="font-black text-white text-lg truncate tracking-tighter uppercase">{currentRoom}</h2>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              <p className="text-[9px] text-emerald-400 font-black uppercase tracking-[0.2em]">P2P ACTIVE</p>
            </div>
          </div>
        </div>

        <div className="hidden lg:flex flex-1 max-w-xs mx-10 items-center gap-3 bg-black/60 border-[3px] border-slate-800 rounded-2xl px-5 py-2.5">
          <User className="text-emerald-500/60 w-4 h-4" />
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-transparent outline-none text-white text-[12px] font-black placeholder:text-slate-800" placeholder="Identity..." />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={copyRoomName} className="p-3 bg-white/5 border-[3px] border-slate-800 rounded-2xl text-slate-400 hover:text-emerald-400 transition-colors">
            {copied ? <Check className="w-4.5 h-4.5" /> : <Copy className="w-4.5 h-4.5" />}
          </button>
          <button onClick={() => { peer?.destroy(); window.location.reload(); }} className="p-3 bg-white/5 border-[3px] border-slate-800 rounded-2xl text-slate-400 hover:text-rose-400">
            <LogOut className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="hidden lg:flex w-80 border-r-[3px] border-slate-800 bg-[#0c1321]/40 flex-col backdrop-blur-md">
          <div className="p-5 border-b-[3px] border-slate-800 flex items-center justify-between bg-black/40">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Assets</h3>
            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-lg border-2 border-emerald-500/30 font-black uppercase">Secure</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {messages.filter(m => m.file).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-10 text-center p-10"><ShieldCheck className="w-10 h-10 mb-2" /><p className="text-[10px] font-black uppercase tracking-widest">No data</p></div>
            ) : (
              messages.filter(m => m.file).map((msg) => (
                <div key={msg.id} className="bg-black/50 p-4 rounded-[2rem] border-[3px] border-slate-800 flex flex-col gap-3 group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border-2 border-emerald-500/30">{getFileIcon(msg.file!.type)}</div>
                    <div className="flex-1 min-w-0"><p className="text-[11px] font-black truncate text-white uppercase">{msg.file?.name}</p><p className="text-[9px] text-emerald-500/40 font-black truncate">{msg.sender}</p></div>
                  </div>
                  <button onClick={() => downloadFile(msg.file)} className="w-full bg-emerald-600 text-white py-2.5 rounded-xl text-[9px] font-black uppercase tracking-[0.3em] hover:bg-emerald-500 border-b-4 border-emerald-800 active:translate-y-0.5 active:border-b-0">Download</button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden border-l-[3px] border-slate-800 relative">
          <div className="flex-1 overflow-y-auto p-4 sm:p-12 space-y-3 custom-scrollbar">
            <div className="max-w-4xl mx-auto space-y-3 relative">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-10 mt-24">
                  <MessageCircle className="w-15 h-15 mb-4 text-emerald-500" />
                  <h2 className="text-xl font-black uppercase text-white">Encrypted Node</h2>
                </div>
              )}
              {messages.map((msg, idx) => {
                if (msg.type === "system") return (
                  <div key={msg.id} className="flex justify-center my-4"><span className="text-[9px] font-black uppercase tracking-[0.4em] px-8 py-2 rounded-2xl bg-[#0c1321] text-emerald-500 border-[3px] border-emerald-500/20 shadow-2xl flex items-center gap-3"><Zap className="w-3 h-3 animate-pulse" /> {msg.text}</span></div>
                );
                const isMe = msg.senderId === MY_ID;
                const showSender = idx === 0 || messages[idx - 1].senderId !== msg.senderId || messages[idx - 1].type === "system";
                return (
                  <motion.div initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} key={msg.id} className={cn("flex flex-col w-full", isMe ? "items-end" : "items-start")}>
                    {showSender && <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-700 mb-1 px-6">{msg.sender}</span>}
                    {msg.file && !msg.text ? (
                      <div className={cn("bg-[#0c1321] border-[3px] rounded-[2rem] shadow-2xl max-w-[85%] sm:max-w-sm overflow-hidden p-2.5", isMe ? "border-emerald-500/30" : "border-slate-800")}>
                        <div className="rounded-[1.8rem] overflow-hidden bg-black/50 aspect-video flex items-center justify-center border-2 border-white/5 relative">
                          {msg.file.type.includes("image") ? <img src={msg.file.previewUrl} className="w-full h-full object-cover" /> : msg.file.type.includes("video") ? <video src={msg.file.previewUrl} controls className="w-full h-full object-cover" /> : <FileIcon className="w-12 h-12 text-slate-800" />}
                        </div>
                        <div className="p-3 flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0"><p className="text-xs font-black text-white truncate uppercase">{msg.file.name}</p></div>
                          <button onClick={() => downloadFile(msg.file)} className="w-10 h-10 bg-white text-black rounded-xl hover:bg-emerald-50 flex items-center justify-center shadow-lg active:scale-95 border-2 border-slate-300"><Download className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ) : (
                      <div className={cn("px-5 py-2.5 shadow-xl text-[14px] font-bold border-[3px] relative",
                        isMe ? "bg-emerald-600 text-white rounded-[1.8rem] rounded-tr-none border-emerald-400/30" : "bg-white text-black rounded-[1.8rem] rounded-tl-none border-slate-300")}>
                        {isMe && <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 blur-3xl opacity-50" />}
                        <span className="relative z-10">{msg.text}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1 px-5 opacity-20"><span className="text-[8px] text-slate-600 font-black uppercase italic">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>{isMe && <Check className="w-2.5 h-2.5 text-emerald-500" />}</div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <footer className="p-4 sm:p-10 bg-[#0c1321]/95 backdrop-blur-3xl border-t-[3px] border-slate-800 shrink-0 shadow-2xl">
            <div className="max-w-4xl mx-auto flex gap-3 sm:gap-5 items-center">
              <div className="flex gap-2 sm:gap-3 shrink-0">
                <button onClick={() => fileInputRef.current?.click()} className="w-11 h-11 sm:w-16 sm:h-16 flex items-center justify-center bg-emerald-600 text-white hover:bg-emerald-500 rounded-2xl border-b-4 border-emerald-800">
                  <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <button onClick={() => folderInputRef.current?.click()} className="w-11 h-11 sm:w-16 sm:h-16 flex items-center justify-center bg-emerald-600 text-white hover:bg-emerald-500 rounded-2xl border-b-4 border-emerald-800">
                  <FolderOpen className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />
              <input type="file" ref={folderInputRef} onChange={handleFileUpload} {...{ webkitdirectory: "", directory: "" } as any} className="hidden" />

              <div className="flex-1 flex items-center bg-black/60 border-[3px] border-slate-700/50 rounded-[2rem] px-5 sm:px-8 py-3 sm:py-5 shadow-inner">
                <textarea rows={1} placeholder="Type message..." value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} className="w-full bg-transparent border-none outline-none text-[14px] sm:text-[15px] text-white font-bold placeholder:text-slate-800 resize-none" />
              </div>

              <button onClick={sendMessage} disabled={!inputText.trim()} className="w-13 h-13 sm:w-20 sm:h-20 shrink-0 flex items-center justify-center bg-emerald-600 text-white rounded-[2rem] border-b-4 border-emerald-900 shadow-xl hover:bg-emerald-500 active:translate-y-1 active:border-b-0">
                <Send className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </footer>
        </div>
      </div>

      <AnimatePresence>
        {fullPreviewUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/98 backdrop-blur-3xl flex items-center justify-center p-8">
            <button onClick={() => setFullPreviewUrl(null)} className="absolute top-10 right-10 text-slate-500 bg-white/5 p-4 rounded-xl border-2 border-slate-800"><X className="w-8 h-8" /></button>
            <motion.img initial={{ scale: 0.95 }} animate={{ scale: 1 }} src={fullPreviewUrl} className="max-w-full max-h-[85vh] object-contain rounded-3xl border-[3px] border-slate-800 shadow-3xl" />
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(16,185,129,0.1); border-radius: 10px; }
        textarea::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

function cn(...inputs: any[]) { return inputs.filter(Boolean).join(" "); }
