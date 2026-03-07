import React, { useState, useEffect, useRef } from "react";
import { Peer, DataConnection } from "peerjs";
import JSZip from "jszip";
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
  const [onlineCount, setOnlineCount] = useState(1);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showAbout, setShowAbout] = useState(false);


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
      if (!excludeConns.some(e => e.peer === conn.peer)) {
        try {
          conn.send(msg);
        } catch (e) {
          console.error("Broadcast failed for peer", conn.peer, e);
        }
      }
    });
  };

  useEffect(() => {
    setOnlineCount(connections.length + 1);
  }, [connections]);

  const handleReceivedData = (data: any, fromConn: DataConnection) => {
    const msg = data as Message;
    // For file messages, we need to ensure the data is preserved correctly
    // The previous implementation was losing binary integrity during serialization
    const cleanMsg = { ...msg, file: msg.file ? { ...msg.file, previewUrl: undefined } : undefined };
    addMessage(cleanMsg);
    if (isHost) broadcast(msg, [fromConn]);
  };

  const setupPeer = (id?: string, roomToUseDisplay?: string) => {
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
          { urls: 'stun:stun.nextcloud.com:443' },
          { urls: 'stun:stun.anyfirewall.com:3478' },
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all'
      }
    };

    const newPeer = id ? new Peer(id, config) : new Peer(config);

    newPeer.on("open", (peerId) => {
      console.log("Peer opened with ID:", peerId);
      if (id) {
        setIsConnected(true);
        setIsConnecting(false);
        setCurrentRoom(roomToUseDisplay || id.split('-rm-')[1]);
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
    const roomToUseInput = (overrideRoom || roomName).trim();
    if (!roomToUseInput) { setError("Enter room name"); return; }

    const roomId = `ppchat-v5-rm-${roomToUseInput.toLowerCase().replace(/\s+/g, '-')}`;
    const roomToUseDisplay = roomToUseInput;

    if (type === "host") {
      setupPeer(roomId, roomToUseDisplay);
    } else {
      setIsConnecting(true);
      const guestPeer = setupPeer();

      const connectionTimeout = setTimeout(() => {
        if (!isConnected) {
          setError("Host is unreachable. Check code or host status.");
          setIsConnecting(false);
          guestPeer.destroy();
        }
      }, 12000);

      guestPeer.on("open", () => {
        console.log("Guest peer open, connecting to host:", roomId);
        const conn = guestPeer.connect(roomId, {
          reliable: true,
          serialization: 'binary'
        });

        conn.on("open", () => {
          clearTimeout(connectionTimeout);
          setIsConnected(true);
          setIsConnecting(false);
          setIsHost(false);
          setCurrentRoom(roomToUseDisplay);
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
      // Small delay to ensure PeerJS library is ready and UI is rendered
      const t = setTimeout(() => {
        handleJoinOrCreate("join", roomParam);
      }, 1000);
      return () => clearTimeout(t);
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
    const filesArray = Array.from(files) as File[];

    // If it's a folder or multiple files, zip them
    const isFolder = filesArray.some(f => (f as any).webkitRelativePath && (f as any).webkitRelativePath.includes('/'));

    if (isFolder || filesArray.length > 1) {
      const zip = new JSZip();
      let zipName = "files.zip";

      if (isFolder) {
        // Try to get the root folder name
        const firstPath = (filesArray[0] as any).webkitRelativePath;
        if (firstPath) {
          const rootFolder = firstPath.split('/')[0];
          zipName = `${rootFolder}.zip`;

          // Create a root folder inside the zip as per user request
          const folder = zip.folder(rootFolder);
          if (folder) {
            for (const file of filesArray) {
              const relativePath = (file as any).webkitRelativePath;
              // Remove the root folder from the beginning of the path since we're already in it
              const internalPath = relativePath.split('/').slice(1).join('/');
              folder.file(internalPath, file);
            }
          }
        } else {
          for (const file of filesArray) zip.file(file.name, file);
        }
      } else {
        for (const file of filesArray) zip.file(file.name, file);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const arrayBuffer = await zipBlob.arrayBuffer();

      const msg: Message = {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sender: currentName,
        senderId: MY_ID,
        file: {
          name: zipName,
          type: "application/zip",
          data: arrayBuffer,
          size: arrayBuffer.byteLength,
        },
        timestamp: Date.now(),
      };

      addMessage(msg);
      if (isHost) broadcast(msg); else connections[0]?.send(msg);
    } else {
      // Single file upload
      const file = files[0];
      const arrayBuffer = await file.arrayBuffer();

      const msg: Message = {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sender: currentName,
        senderId: MY_ID,
        file: {
          name: file.name,
          type: file.type || "application/octet-stream",
          data: arrayBuffer,
          size: file.size,
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
    <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10 bg-[#030712]">
      {/* Animated Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] animate-blob" />
      <div className="absolute top-[20%] right-[-5%] w-[400px] h-[400px] bg-teal-500/10 rounded-full blur-[100px] animate-blob [animation-delay:2s]" />
      <div className="absolute bottom-[-10%] left-[10%] w-[600px] h-[600px] bg-emerald-600/5 rounded-full blur-[150px] animate-blob [animation-delay:4s]" />

      {/* Subtle Grid */}
      <div className="absolute inset-0 opacity-[0.02]"
        style={{ backgroundImage: `radial-gradient(#fff 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />

      {/* Noise Overlay */}
      <div className="absolute inset-0 opacity-[0.015] pointer-events-none overflow-hidden"
        style={{ backgroundImage: `url('https://grainy-gradients.vercel.app/noise.svg')` }} />
    </div>
  );


  const LandingSection = () => (
    <div className="w-full space-y-40 pb-40">
      {/* Visual Break / P2P Explanation */}
      <section className="max-w-6xl mx-auto px-6">
        <div className="glass-emerald rounded-[4rem] p-12 sm:p-20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 blur-[100px] -mr-48 -mt-48 transition-all group-hover:bg-emerald-500/20" />

          <div className="grid lg:grid-cols-2 gap-16 items-center relative z-10">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em]">
                <Zap className="w-3 h-3" /> Technical Core
              </div>
              <h2 className="text-4xl sm:text-6xl font-black text-white leading-[0.9] tracking-tighter uppercase">
                What is <span className="text-emerald-500">P2P</span> transmission?
              </h2>
              <p className="text-lg text-slate-400 font-medium leading-relaxed">
                Standard apps send your data to a central database. <span className="text-white">PPChat destroys the middleman.</span> Your files are sliced into encrypted packets and streamed directly to your peer's browser memory.
              </p>
              <div className="flex flex-wrap gap-4">
                <div className="px-6 py-4 bg-white/5 rounded-3xl border border-white/10 space-y-1">
                  <div className="text-white font-black uppercase text-xs">Direct Link</div>
                  <div className="text-slate-500 text-[10px] uppercase font-bold">No Server Bounce</div>
                </div>
                <div className="px-6 py-4 bg-white/5 rounded-3xl border border-white/10 space-y-1">
                  <div className="text-white font-black uppercase text-xs">Zero Logs</div>
                  <div className="text-slate-500 text-[10px] uppercase font-bold">RAM-Only Existence</div>
                </div>
              </div>
            </div>

            <div className="relative aspect-square sm:aspect-video flex items-center justify-center">
              <div className="absolute inset-0 bg-emerald-500/5 rounded-[3rem] animate-pulse" />
              <div className="flex items-center gap-8 relative z-10">
                <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center animate-float">
                  <User className="text-black w-10 h-10" />
                </div>
                <div className="w-32 h-[2px] bg-gradient-to-r from-emerald-500 via-emerald-400 to-transparent relative">
                  <motion.div
                    animate={{ x: [0, 128], opacity: [0, 1, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full blur-sm"
                  />
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-3 py-1 bg-black border border-emerald-500/30 rounded-lg text-[8px] font-black text-emerald-500 uppercase">Streaming</div>
                </div>
                <div className="w-24 h-24 glass rounded-[2rem] flex items-center justify-center animate-float [animation-delay:1s]">
                  <Sparkles className="text-emerald-500 w-10 h-10" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto px-6 grid md:grid-cols-3 gap-8">
        {[
          { icon: <ShieldCheck className="w-8 h-8" />, color: "emerald", title: "Node Isolation", desc: "Every chat room is a temporary, cryptographically isolated node." },
          { icon: <Zap className="w-8 h-8" />, color: "teal", title: "Max Velocity", desc: "Bypass ISP throttles by using multiple concurrent P2P data streams." },
          { icon: <Lock className="w-8 h-8" />, color: "slate", title: "Deep Privacy", desc: "Metadata is never stored. Your presence is anonymous by default." }
        ].map((f, i) => (
          <motion.div
            whileHover={{ y: -10 }}
            key={i} className="p-10 glass border-2 border-slate-900 rounded-[3.5rem] group transition-all hover:border-emerald-500/30">
            <div className={`w-16 h-16 rounded-[1.8rem] bg-white text-black flex items-center justify-center mb-10 shadow-2xl group-hover:bg-emerald-500 group-hover:text-white transition-colors duration-500`}>
              {f.icon}
            </div>
            <h3 className="text-xl font-black text-white uppercase tracking-widest mb-4">{f.title}</h3>
            <p className="text-slate-500 font-bold uppercase text-[12px] leading-relaxed">{f.desc}</p>
          </motion.div>
        ))}
      </section>

      {/* FAQ Visualized */}
      <section className="max-w-4xl mx-auto px-6 space-y-16">
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic">FAQ Nodes</h2>
          <div className="w-20 h-1.5 bg-emerald-500 mx-auto rounded-full" />
        </div>
        <div className="space-y-4">
          {[
            { q: "Is registration required?", a: "No. PPChat is a transient system. You simply pick an identity tag and a room code to begin. We do not store user accounts." },
            { q: "How secure is the file transfer?", a: "All data transfers use standard WebRTC encryption (DTLS/SRTP). There is no intermediary server to intercept your data." },
            { q: "What is the maximum file size?", a: "Practical limits are defined by your device's RAM and connection stability. Transfers up to 2GB are common." }
          ].map((item, i) => (
            <div key={i} className="p-8 glass border border-slate-800 rounded-[2.5rem] hover:bg-white/[0.02] transition-colors">
              <h4 className="text-emerald-400 font-black uppercase text-sm mb-3 flex items-center gap-3">
                <ChevronRight className="w-4 h-4" /> {item.q}
              </h4>
              <p className="text-slate-500 text-[13px] font-bold uppercase leading-relaxed pl-7">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-6 text-center border-t border-slate-900 pt-20">
        <div className="flex flex-wrap justify-center gap-x-12 gap-y-6 text-[11px] font-black uppercase tracking-[0.4em] text-slate-500 mb-20">
          <button onClick={() => setShowAbout(true)} className="hover:text-emerald-400 hover:text-glow transition-all">Specs</button>
          <button onClick={() => setShowPrivacy(true)} className="hover:text-emerald-400 hover:text-glow transition-all">Privacy</button>
          <button onClick={() => setShowTerms(true)} className="hover:text-emerald-400 hover:text-glow transition-all">Terms</button>
          <a href="mailto:support@ppchat.com" className="hover:text-emerald-400 hover:text-glow transition-all">Support</a>
        </div>
        <div className="space-y-2 opacity-30 group cursor-default">
          <div className="text-[10px] font-black text-white uppercase tracking-[1.5em] group-hover:tracking-[1.8em] transition-all duration-1000">PPChat Engine</div>
          <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">&copy; 2024 DECENTRALIZED DATA LAYER</div>
        </div>
      </footer>
    </div>
  );


  const Modal = ({ title, content, onClose }: { title: string, content: React.ReactNode, onClose: () => void }) => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/90 backdrop-blur-3xl overflow-y-auto">
      <div className="bg-[#0c1321] border-4 border-slate-800 rounded-[3rem] w-full max-w-2xl p-10 relative my-10 shadow-[0_0_100px_rgba(0,0,0,0.8)]">
        <button onClick={onClose} className="absolute top-8 right-8 text-slate-500 hover:text-white"><X className="w-8 h-8" /></button>
        <div className="space-y-8">
          <h2 className="text-2xl font-black text-white uppercase tracking-widest border-b-2 border-emerald-500/20 pb-4">{title}</h2>
          <div className="text-slate-400 font-bold text-sm leading-relaxed space-y-6 overflow-y-auto max-h-[60vh] pr-4 custom-scrollbar">
            {content}
          </div>
          <button onClick={onClose} className="w-full bg-emerald-600 text-white py-5 rounded-[1.8rem] font-black text-xs uppercase tracking-widest border-b-4 border-emerald-900 active:translate-y-1 active:border-b-0">Acknowledge</button>
        </div>
      </div>
    </motion.div>
  );

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#030712] font-sans overflow-x-hidden overflow-y-auto custom-scrollbar">
        <BgEffect />
        <AdWidget />

        {/* Hero Section */}
        <div className="relative pt-10 px-6">
          {/* Logo & Navbar */}
          <nav className="max-w-7xl mx-auto flex items-center justify-between py-6 mb-20 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center glow-emerald rotate-3">
                <MessagesSquare className="text-black w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-black text-white uppercase tracking-tighter leading-none">PPChat</span>
                <span className="text-[8px] font-black text-emerald-500 uppercase tracking-[0.4em]">Engine v5.3</span>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-8 text-[11px] font-black text-slate-500 uppercase tracking-widest">
              <a href="#about" className="hover:text-white transition-colors">Protocol</a>
              <a href="#features" className="hover:text-white transition-colors">Nodes</a>
              <button onClick={() => setShowAbout(true)} className="px-5 py-2.5 glass rounded-xl text-emerald-500 hover:text-white transition-all">Project Log</button>
            </div>
          </nav>

          <div className="max-w-7xl mx-auto grid lg:grid-cols-[1.2fr,1fr] gap-20 items-center">
            {/* Hero Text */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-10 relative z-10">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-emerald text-emerald-500 text-[10px] font-black uppercase tracking-widest">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Fully Decentralized & Secure
                </div>
                <h1 className="text-7xl sm:text-8xl lg:text-9xl font-black text-white leading-[0.85] tracking-tighter uppercase italic">
                  Instant <br />
                  <span className="text-emerald-500 text-glow">P2P</span> Chat.
                </h1>
                <p className="text-xl text-slate-400 font-medium max-w-xl leading-relaxed">
                  Eliminate servers. Exchange messages and files directly between browsers using high-performance <span className="text-white">WebRTC Grid</span> technology.
                </p>
              </div>

              <div className="flex flex-wrap gap-6 items-center">
                <div className="flex -space-x-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="w-10 h-10 rounded-full border-2 border-[#030712] bg-slate-800" />
                  ))}
                </div>
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <span className="text-white">50k+</span> Nodes deployed weekly
                </div>
              </div>
            </motion.div>

            {/* Entry Form Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="relative group">
              <div className="absolute inset-0 bg-emerald-500/20 blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <div className="glass border-2 border-slate-800/50 rounded-[3rem] p-10 sm:p-12 relative z-10 shadow-2xl overflow-hidden group">
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-[60px] rounded-full translate-x-1/2 -translate-y-1/2" />

                <div className="space-y-8 relative z-10">
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">Identity Handshake</h2>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Select your node parameters</p>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 ml-1">Identity Tag</label>
                      <input
                        type="text" placeholder="ALIANT NAME..." value={username} onChange={(e) => setUsername(e.target.value)}
                        className="w-full bg-black/40 border-2 border-slate-800 rounded-2xl py-5 px-7 outline-none text-white text-lg font-black focus:border-emerald-500 focus:glow-emerald transition-all placeholder:text-slate-900"
                      />
                    </div>
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 ml-1">Room Protocol Code</label>
                      <input
                        type="text" placeholder="ENTRY CODE..." value={roomName} onChange={(e) => setRoomName(e.target.value)}
                        className="w-full bg-black/40 border-2 border-slate-800 rounded-2xl py-5 px-7 outline-none text-white text-lg font-black focus:border-emerald-500 focus:glow-emerald transition-all placeholder:text-slate-900"
                      />
                    </div>

                    {error && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-rose-400 text-[10px] font-black uppercase bg-rose-500/10 p-4 rounded-xl border border-rose-500/20 flex items-center gap-3">
                        <AlertCircle className="w-4 h-4" /> {error}
                      </motion.div>
                    )}

                    <div className="grid grid-cols-2 gap-5 pt-4">
                      <button
                        onClick={() => handleJoinOrCreate("host")}
                        disabled={isConnecting}
                        className="group/btn relative h-16 bg-white text-black rounded-[1.5rem] font-black text-xs uppercase tracking-widest overflow-hidden transition-all active:scale-95 disabled:opacity-50"
                      >
                        <div className="absolute inset-0 bg-emerald-500/10 translate-y-full group-hover/btn:translate-y-0 transition-transform" />
                        <div className="relative flex items-center justify-center gap-2">
                          {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-5 h-5 transition-transform group-hover/btn:rotate-12" />}
                          <span>Host</span>
                        </div>
                      </button>
                      <button
                        onClick={() => handleJoinOrCreate("join")}
                        disabled={isConnecting}
                        className="group/btn relative h-16 bg-emerald-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest overflow-hidden transition-all active:scale-95 border-b-4 border-emerald-900 disabled:opacity-50"
                      >
                        <div className="absolute inset-0 bg-white/10 -translate-x-full group-hover/btn:translate-x-0 transition-transform" />
                        <div className="relative flex items-center justify-center gap-2">
                          {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-6 h-6 transition-transform group-hover/btn:translate-x-1" />}
                          <span>Join</span>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Dynamic Landing Sections */}
        <div className="mt-60">
          <LandingSection />
        </div>
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
              <p className="text-[9px] text-emerald-400 font-black uppercase tracking-[0.2em]">{onlineCount} {onlineCount === 1 ? 'Peer' : 'Peers'} Active</p>
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
