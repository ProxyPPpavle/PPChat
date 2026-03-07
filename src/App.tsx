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
  Sparkles,
  Cpu
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
  const [showTermsPage, setShowTermsPage] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);


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

  const TechParticles = () => {
    const characters = "0101010101010101ABCDEF".split("");
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ y: -100, x: Math.random() * 2000 }}
            animate={{
              y: [null, 1200],
              opacity: [0, 1, 1, 0]
            }}
            transition={{
              duration: 5 + Math.random() * 10,
              repeat: Infinity,
              delay: Math.random() * 10,
              ease: "linear"
            }}
            className="absolute text-[10px] font-mono text-emerald-500/40 select-none"
          >
            {characters[Math.floor(Math.random() * characters.length)]}
          </motion.div>
        ))}
        {Array.from({ length: 15 }).map((_, i) => (
          <motion.div
            key={`line-${i}`}
            initial={{ x: -1000, y: Math.random() * 1000 }}
            animate={{ x: 2000 }}
            transition={{
              duration: 10 + Math.random() * 20,
              repeat: Infinity,
              delay: Math.random() * 10,
              ease: "linear"
            }}
            className="absolute h-[1px] w-[300px] bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent"
          />
        ))}
      </div>
    );
  };

  const BgEffect = () => (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10 bg-[#0b0f1a]">
      {/* 1. Deep Base Layer */}
      <div className="absolute inset-0 bg-[#0b0f1a]" />
      <div className="absolute inset-0 bg-vibrant opacity-90" />

      {/* 2. Technical Grid (Chessboard) */}
      <div className="absolute inset-0 tech-grid opacity-[0.08]" />
      <div className="absolute inset-0 pixel-pattern opacity-[0.05]" />

      {/* 3. Ghost Code Layers - Static Flickering Hex */}
      <div className="absolute inset-0 opacity-[0.03] font-mono text-[8px] flex flex-wrap gap-4 p-8 overflow-hidden select-none pointer-events-none leading-none text-emerald-500">
        {Array.from({ length: 100 }).map((_, i) => (
          <span key={i} className="animate-pulse">{Math.random().toString(16).substring(2, 8).toUpperCase()}</span>
        ))}
      </div>

      {/* 4. Scanning Beams */}
      <div className="passing-line-v opacity-60" />
      <div className="passing-line-h opacity-40 shadow-[0_0_25px_rgba(59,130,246,0.4)]" />
      <div className="passing-line-v opacity-20 [animation-delay:4s] [animation-duration:15s]" />

      {/* 5. Tactical Overlays */}
      <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-emerald-500/5 to-transparent" />
      <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-blue-500/5 to-transparent" />

      {/* 6. Textures & Grain */}
      <div className="absolute inset-0 opacity-[0.06] contrast-125 brightness-125 pointer-events-none"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />

      <TechParticles />

      {/* 7. Massive Depth Glows */}
      <motion.div
        animate={{ x: [0, 80, -80, 0], y: [0, -80, 80, 0], scale: [1, 1.2, 0.9, 1] }}
        transition={{ duration: 35, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-[-25%] left-[-25%] w-[1400px] h-[1400px] bg-emerald-500/15 rounded-full blur-[250px]" />
      <motion.div
        animate={{ x: [0, -60, 60, 0], y: [0, 90, -90, 0], scale: [1, 0.85, 1.15, 1] }}
        transition={{ duration: 40, repeat: Infinity, ease: "easeInOut", delay: 5 }}
        className="absolute bottom-[-20%] right-[-20%] w-[1200px] h-[1200px] bg-blue-600/10 rounded-full blur-[220px]" />
      <motion.div
        animate={{ opacity: [0.1, 0.2, 0.1] }}
        transition={{ duration: 10, repeat: Infinity }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1600px] h-[1600px] bg-white/[0.02] rounded-full blur-[300px]" />

      {/* 8. Digital CRT Artifacts */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.15)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.02),rgba(0,0,255,0.03))] bg-[length:100%_3px,2px_100%] pointer-events-none opacity-30" />
    </div>
  );





  const LandingSection = () => (
    <div className="w-full space-y-40 pb-32 relative z-10 font-sans">
      {/* 1. Why Choose Us? */}
      <section id="why" className="max-w-7xl mx-auto px-6 scroll-mt-24">
        <div className="text-center mb-24 space-y-6">
          <h2 className="text-5xl sm:text-7xl font-black text-white uppercase tracking-tighter italic pb-4">Why Choose <span className="glow-text">Us?</span></h2>
          <p className="text-emerald-500 font-bold uppercase tracking-[0.4em] text-[12px] opacity-80 decoration-white/10 underline underline-offset-8">The P2P Advantage Protocol</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { id: "01", title: "Pure Security", desc: "No servers, no logs, no eyes. Just your data flowing in RAM." },
            { id: "02", title: "Maximum Speed", desc: "Direct browser-to-browser links with 0ms server latency." },
            { id: "03", title: "No Logins", desc: "Anonymous access. Choose an alias and start syncing instantly." },
            { id: "04", title: "Zero Trace", desc: "Your data exists only while the session is active. Purged on exit." }
          ].map((item, i) => (
            <div key={i} className="group p-10 glass-card rounded-[3rem] border-white/5 hover-glow relative overflow-visible">
              <div className="circle-id mb-8">{item.id}</div>
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-6 italic transition-colors group-hover:text-emerald-400 leading-none">{item.title}</h3>
              <p className="text-slate-400 font-bold uppercase text-[11px] leading-relaxed tracking-wider opacity-60 group-hover:opacity-100 transition-opacity">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 2. What We Offer (RESTRUCTURED) */}
      <section id="offer" className="max-w-7xl mx-auto px-6 scroll-mt-24">
        <div className="glass-card rounded-[5rem] p-12 sm:p-24 relative overflow-hidden group border-white/5 shadow-3xl">
          <div className="grid lg:grid-cols-[1fr,1.2fr] gap-20 items-center relative z-10">
            {/* Left: Title & Description */}
            <div className="space-y-10">
              <div className="space-y-6">
                <div className="px-6 py-2 glass rounded-full border-emerald-500/10 w-fit text-[11px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> Capabilities Grid
                </div>
                <h2 className="text-5xl sm:text-7xl font-black text-white leading-[0.85] tracking-tighter uppercase italic pb-4">
                  Built for <br /><span className="glow-text italic">Performance</span>.
                </h2>
                <p className="text-xl text-slate-400 font-medium leading-relaxed italic border-l-2 border-emerald-500/20 pl-8 max-w-lg">
                  PPChat isn't just messaging. It's a high-performance decentralized data layer for the modern web.
                </p>
              </div>
            </div>

            {/* Right: Capabilities Grid */}
            <div className="space-y-8">
              {[
                { title: "Universal File Transfer", desc: "Send any file, folder, or asset without size limits or compression." },
                { title: "Real-time Terminal", desc: "Low-latency chat grid with zero server overhead or middleman." },
                { title: "Encrypted Tunnels", desc: "P2P WebRTC tunnels with AES-256 poly1305 and GRID stabilization." }
              ].map((item, i) => (
                <div key={i} className="flex gap-8 group/item glass p-6 rounded-[2.5rem] border-white/5 hover:border-emerald-500/20 transition-all hover:translate-x-4">
                  <div className="w-14 h-14 bg-emerald-500/10 rounded-[1.5rem] flex items-center justify-center border border-white/5 group-hover/item:bg-emerald-500 group-hover/item:text-white transition-all text-emerald-500 shadow-xl shrink-0">
                    <ChevronRight className="w-7 h-7" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-white font-black uppercase tracking-[0.2em] text-base italic transition-colors group-hover/item:text-emerald-400 leading-none">{item.title}</h4>
                    <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.1em] opacity-60 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. FAQ (Moved up) */}
      <section id="faq" className="max-w-5xl mx-auto px-6 space-y-20 scroll-mt-24">
        <div className="text-center space-y-6">
          <h2 className="text-5xl font-black text-white uppercase tracking-tighter italic pb-4">Common <span className="glow-text">Queries</span></h2>
          <p className="text-slate-500 font-bold uppercase tracking-[0.4em] text-[12px]">Technical Support Environment</p>
        </div>
        <div className="grid md:grid-cols-2 gap-8">
          {[
            { q: "Is there a file size limit?", a: "No absolute limit. Stability depends on your local RAM and peer connection quality. Transfers are direct, so it's as fast as your hardware allows." },
            { q: "Is it really database-free?", a: "Yes. Every byte passes through RAM only. Once you close the tab, the room and all messages are permanently purged from the universe." },
            { q: "Browser compatibility?", a: "Works on all modern browsers (Chrome, Firefox, Safari, Edge) that support WebRTC technology natively." },
            { q: "Security levels?", a: "We use WebRTC's military-grade encryption complemented by our p2p tunneling, ensuring extreme data privacy." }
          ].map((item, i) => (
            <div key={i} className="p-10 glass rounded-[3rem] border-white/5 hover-glow group flex flex-col justify-center">
              <h4 className="text-white font-black uppercase text-lg mb-6 flex items-center gap-5 italic group-hover:text-emerald-400 transition-colors leading-none pb-2">
                <span className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-[12px] text-emerald-500 font-black shadow-inner">?</span>
                {item.q}
              </h4>
              <p className="text-slate-500 text-[12px] font-bold uppercase leading-relaxed tracking-wide px-4 border-l-2 border-white/5 group-hover:border-emerald-500/30 transition-all">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Ready to Transfer? (Final CTA - REDUCED SIZE) */}
      <section className="max-w-4xl mx-auto px-6 pt-10">
        <div className="relative p-12 sm:p-20 glass rounded-[4rem] text-center border-white/5 overflow-hidden group shadow-3xl hover-glow">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="relative z-10 space-y-8">
            <h2 className="text-4xl sm:text-6xl font-black text-white uppercase tracking-tighter italic leading-[0.8] pb-2">
              Ready to <br /><span className="glow-text italic">Sync</span> Data?
            </h2>
            <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[11px] max-w-lg mx-auto leading-loose italic opacity-70">
              Join the decentralized grid. Connect directly. Sync everything instantly.
            </p>
            <div className="flex justify-center pt-6">
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="px-12 py-6 bg-white text-black rounded-[2.5rem] font-black text-xs uppercase tracking-[0.4em] hover:bg-emerald-500 hover:text-white transition-all shadow-[0_20px_60px_rgba(0,0,0,0.3)] active:scale-95"
              >
                Initialise Node
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-6 text-center pt-24 pb-8">
        <div className="flex flex-wrap justify-center gap-x-20 gap-y-10 text-[12px] font-black uppercase tracking-[0.5em] text-slate-600 mb-20 italic">
          <a href="#why" className="hover:text-white transition-colors hover:glow-text">Protocol</a>
          <a href="#offer" className="hover:text-white transition-colors hover:glow-text">Capabilities</a>
          <a href="#faq" className="hover:text-white transition-colors hover:glow-text">Queries</a>
          <button onClick={() => setShowTermsPage(true)} className="hover:text-emerald-500 transition-all uppercase whitespace-nowrap">Legal Terminal</button>
        </div>
        <div className="opacity-10 space-y-6 pt-10 border-t border-white/5">
          <div className="text-[14px] font-black text-white uppercase tracking-[1.5em] select-none">PPChat</div>
          <div className="text-[8px] font-bold text-slate-500 uppercase tracking-[0.3em] font-mono">ENCRYPTED INFRASTRUCTURE LAYER v2.0.42</div>
        </div>
      </footer>
    </div>
  );





  if (showTermsPage) {
    return (
      <div className="min-h-screen bg-[#0f172a] font-sans p-10 sm:p-20 relative">
        <BgEffect />
        <button onClick={() => setShowTermsPage(false)} className="fixed top-8 left-8 glass px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-emerald-500 hover:bg-white hover:text-black transition-all z-50">Back to Room</button>
        <div className="max-w-3xl mx-auto space-y-12 pt-16">
          <header className="space-y-4">
            <h1 className="text-5xl font-black text-white uppercase tracking-tighter italic">Terms of <span className="glow-text italic">Service</span></h1>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Effective: 2024.3.7</p>
          </header>
          <div className="space-y-8 text-slate-400 font-bold uppercase text-[11px] leading-relaxed tracking-wider">
            <section className="space-y-3">
              <h2 className="text-white text-base italic">1. Service Usage</h2>
              <p>By using PPChat, you accept responsibility for all data streams passing through your local memory. We do not monitor, intercept, or record any traffic.</p>
            </section>
            <section className="space-y-3">
              <h2 className="text-white text-base italic">2. Disclaimer</h2>
              <p>As a decentralized service, we have no control over data loss, connection drops, or peer stability. Use at your own risk during tactical operations.</p>
            </section>
            <section className="space-y-3">
              <h2 className="text-white text-base italic">3. Prohibited Conduct</h2>
              <p>Transmission of illegal material via P2P tunnels is strictly prohibited. You are responsible for your conduct; you are legally responsible for your output.</p>
            </section>
          </div>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#0f172a] font-sans overflow-x-hidden overflow-y-auto custom-scrollbar">
        <BgEffect />
        <AdWidget />

        {/* Minimal Header */}
        <header className="max-w-[1600px] mx-auto flex items-center justify-between py-8 px-8 sticky top-0 bg-[#0f172a]/40 backdrop-blur-2xl z-[100] border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center rotate-3 shadow-xl">
              <MessagesSquare className="text-black w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black text-white uppercase tracking-tighter leading-none italic">PPChat</span>
              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.3em] leading-none mt-1">v5.3</span>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-10 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] italic">
            <a href="#protocol" className="hover:text-emerald-400 transition-all">Protocol</a>
            <a href="#rooms" className="hover:text-emerald-400 transition-all">Rooms</a>
            <a href="#specs" className="hover:text-emerald-400 transition-all">Specs</a>
            <a href="#faq" className="hover:text-emerald-400 transition-all">FAQ</a>
          </nav>

          <div className="hidden sm:block">
            <div className="text-[9px] font-bold text-emerald-500/40 uppercase tracking-widest italic flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> Grid Online
            </div>
          </div>
        </header>

        {/* Hero Section (REDUCED SIZE) */}
        <section className="relative pt-20 pb-16 px-8 max-w-[1600px] mx-auto z-10 overflow-visible">
          <div className="flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-24">
            {/* Left Content Div */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="flex-1 space-y-10 max-w-2xl overflow-visible"
            >
              <div className="space-y-6 overflow-visible">
                <h1 className="text-[9vw] lg:text-[8.5rem] font-black text-white leading-[0.8] tracking-tighter uppercase italic overflow-visible pb-4">
                  Direct <br />
                  <span className="glow-text italic relative inline-block">
                    P2P
                    <div className="absolute -bottom-2 left-0 w-full h-1 bg-emerald-500/10 blur-sm rounded-full" />
                  </span> Chat.
                </h1>
                <p className="text-xl text-slate-300 font-medium leading-relaxed italic opacity-90 border-l-4 border-emerald-500/30 pl-10 max-w-xl">
                  Connect directly between browsers. No servers, no logs, no middleman. <span className="text-emerald-400">WebRTC Grid</span> technical protocol.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-12 pt-2">
                <div className="flex items-center gap-4 group cursor-default">
                  <div className="relative">
                    <div className="w-4 h-4 bg-emerald-500 rounded-full animate-ping absolute inset-0 opacity-50" />
                    <div className="w-4 h-4 bg-emerald-500 rounded-full relative z-10 shadow-[0_0_15px_rgba(16,185,129,0.5)] group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="text-[11px] font-black tracking-[0.5em] text-emerald-400 uppercase italic">Network: Active</div>
                </div>
              </div>
            </motion.div>

            {/* Right Form Div (SHRUNK) */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, x: 50 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="w-full lg:w-[440px] shrink-0"
            >
              <div className="glass-card rounded-[4rem] p-10 sm:p-12 relative z-10 shadow-[0_50px_100px_rgba(0,0,0,0.5)] border-white/5 overflow-hidden group hover-glow">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="space-y-10 relative z-10">
                  <header className="space-y-3 text-center lg:text-left">
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic leading-none pt-2">Entry Portal</h2>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em]">Initialise secure tunnel layer</p>
                  </header>

                  <div className="space-y-6">
                    <div className="space-y-4">
                      <label className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-600 ml-1 italic flex items-center gap-3">
                        <User className="w-4 h-4 text-emerald-500/50" /> Identity
                      </label>
                      <input
                        type="text" placeholder="CHOOSE ALIAS..." value={username} onChange={(e) => setUsername(e.target.value)}
                        className="w-full bg-white/[0.04] border border-white/5 rounded-[1.5rem] py-6 px-8 outline-none text-white text-lg font-black focus:border-emerald-500/40 transition-all placeholder:text-slate-800 uppercase tracking-widest focus:bg-white/[0.06] shadow-inner"
                      />
                    </div>

                    <div className="space-y-4">
                      <label className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-600 ml-1 italic flex items-center gap-3">
                        <Lock className="w-4 h-4 text-blue-500/50" /> Access Key
                      </label>
                      <input
                        type="text" placeholder="ROOM SECRET..." value={roomName} onChange={(e) => setRoomName(e.target.value)}
                        className="w-full bg-white/[0.04] border border-white/5 rounded-[1.5rem] py-6 px-8 outline-none text-white text-lg font-black focus:border-emerald-500/40 transition-all placeholder:text-slate-800 uppercase tracking-widest focus:bg-white/[0.06] shadow-inner"
                      />
                    </div>

                    {error && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-rose-400 text-[10px] font-black uppercase bg-rose-500/10 p-5 rounded-[1.5rem] border border-rose-500/20 flex items-center gap-4 italic shadow-2xl">
                        <AlertCircle className="w-5 h-5" /> {error}
                      </motion.div>
                    )}

                    <div className="grid grid-cols-2 gap-5 pt-4">
                      <button
                        onClick={() => handleJoinOrCreate("host")}
                        disabled={isConnecting}
                        className="h-20 bg-white text-black rounded-[2rem] font-black text-xs uppercase tracking-[0.4em] hover:bg-emerald-500 hover:text-white hover:scale-[1.03] transition-all disabled:opacity-50 active:scale-[0.97] shadow-2xl flex items-center justify-center gap-3 group/btn"
                      >
                        <User className="w-4 h-4 text-emerald-500 group-hover/btn:text-white transition-colors" />
                        {isConnecting ? "DEPLOYING..." : "HOST"}
                      </button>
                      <button
                        onClick={() => handleJoinOrCreate("join")}
                        disabled={isConnecting}
                        className="h-20 bg-emerald-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.4em] hover:bg-emerald-500 hover:scale-[1.03] transition-all disabled:opacity-50 active:scale-[0.97] shadow-2xl flex items-center justify-center gap-3 group/btn"
                      >
                        <Lock className="w-4 h-4 text-white/50 group-hover/btn:text-white transition-colors" />
                        {isConnecting ? "LINKING..." : "JOIN"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Landing Sections */}
        <div className="mt-24">
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
