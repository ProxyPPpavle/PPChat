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
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Message {
  id: string;
  sender: string;
  text?: string;
  file?: {
    name: string;
    type: string;
    data: string | Blob; // Can be base64 for legacy or Blob for new
    size?: number;
  };
  timestamp: number;
  type?: "system";
  systemType?: "join" | "leave" | "error";
}

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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Save username
  useEffect(() => {
    if (username) localStorage.setItem("ppchat-username", username);
  }, [username]);

  const addMessage = (msg: Message) => {
    setMessages((prev) => {
      if (prev.find((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  };

  const broadcast = (msg: Message, excludeConns: DataConnection[] = []) => {
    connections.forEach((conn) => {
      if (!excludeConns.some(e => e.peer === conn.peer)) {
        conn.send(msg);
      }
    });
  };

  const handleReceivedData = (data: any, fromConn: DataConnection) => {
    console.log("Received data:", data);
    const msg = data as Message;
    addMessage(msg);

    // If I am the host, I need to broadcast this to all other peers
    if (isHost) {
      setConnections(prev => {
        prev.forEach(conn => {
          if (conn.peer !== fromConn.peer) {
            conn.send(msg);
          }
        });
        return prev;
      });
    }
  };

  const setupPeer = (id?: string) => {
    setError(null);
    setIsConnecting(true);

    // Create new peer. If id is provided, it's specific (hosting), otherwise random (joining)
    const newPeer = id ? new Peer(id) : new Peer();

    newPeer.on("open", (peerId) => {
      console.log("Peer opened with ID:", peerId);
      if (id) {
        // Host mode
        setIsConnected(true);
        setIsConnecting(false);
        setCurrentRoom(roomName.trim());
        setIsHost(true);
      }
    });

    newPeer.on("connection", (conn) => {
      console.log("New connection from:", conn.peer);

      conn.on("open", () => {
        setConnections((prev) => [...prev, conn]);

        // Notify host UI
        const joinMsg: Message = {
          id: `sys-${Date.now()}-${Math.random()}`,
          sender: "System",
          text: `A peer connected`,
          timestamp: Date.now(),
          type: "system",
          systemType: "join",
        };
        addMessage(joinMsg);
      });

      conn.on("data", (data: any) => handleReceivedData(data, conn));

      conn.on("close", () => {
        setConnections((prev) => prev.filter((c) => c.peer !== conn.peer));
      });
    });

    newPeer.on("error", (err) => {
      console.error("Peer error:", err);
      setIsConnecting(false);
      if (err.type === "unavailable-id") {
        setError("This room name is already taken. Try another or Join.");
      } else {
        setError(`Connection failed: ${err.type}`);
      }
    });

    setPeer(newPeer);
    return newPeer;
  };

  const handleJoinOrCreate = (type: "host" | "join") => {
    if (!roomName.trim()) {
      setError("Please enter a room name");
      return;
    }

    const roomId = `ppchat-rm-${roomName.trim().toLowerCase()}`;

    if (type === "host") {
      setupPeer(roomId);
    } else {
      setIsConnecting(true);
      const guestPeer = setupPeer(); // Connect with random ID

      guestPeer.on("open", () => {
        console.log("Connecting to host:", roomId);
        const conn = guestPeer.connect(roomId, { reliable: true });

        conn.on("open", () => {
          console.log("Connected to host successfully!");
          setIsConnected(true);
          setIsConnecting(false);
          setIsHost(false);
          setCurrentRoom(roomName.trim());
          setConnections([conn]);

          const joinMsg: Message = {
            id: `sys-join-${Date.now()}`,
            sender: username.trim() || "Anonymous",
            text: `${username.trim() || "Anonymous"} joined the chat`,
            timestamp: Date.now(),
            type: "system",
            systemType: "join",
          };
          conn.send(joinMsg);
        });

        conn.on("data", (data) => handleReceivedData(data, conn));

        conn.on("error", (err) => {
          console.error("Connection error:", err);
          setError("Could not connect to room. Make sure the Host is active.");
          setIsConnecting(false);
        });

        conn.on("close", () => {
          setIsConnected(false);
          setCurrentRoom(null);
          setError("Connection closed by host.");
        });
      });
    }
  };

  const sendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !peer) return;

    const msg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender: username.trim() || "Anonymous",
      text: inputText.trim(),
      timestamp: Date.now(),
    };

    addMessage(msg);

    if (isHost) {
      broadcast(msg);
    } else {
      connections[0]?.send(msg);
    }

    setInputText("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !peer) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const msg: Message = {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sender: username.trim() || "Anonymous",
        file: {
          name: file.name,
          type: file.type || "application/octet-stream",
          data: file, // Send the File/Blob object directly!
          size: file.size,
        },
        timestamp: Date.now(),
      };

      addMessage(msg);
      if (isHost) {
        broadcast(msg);
      } else {
        connections[0]?.send(msg);
      }
    }

    if (e.target) e.target.value = "";
  };

  const downloadFile = (fileData: any) => {
    const { name, data } = fileData;
    let blob: Blob;

    if (data instanceof Blob) {
      blob = data;
    } else if (typeof data === "string" && data.startsWith("data:")) {
      // Legacy base64 handling
      const byteString = atob(data.split(",")[1]);
      const mimeString = data.split(",")[0].split(":")[1].split(";")[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      blob = new Blob([ab], { type: mimeString });
    } else {
      console.error("Invalid file data format");
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLeaveRoom = () => {
    peer?.destroy();
    window.location.reload();
  };

  const copyRoomName = () => {
    navigator.clipboard.writeText(roomName);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatFileSize = (bytes: number = 0) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (type: string) => {
    if (type.includes("image")) return <ImageIcon size={20} className="text-blue-500" />;
    if (type.includes("video")) return <VideoIcon size={20} className="text-purple-500" />;
    return <FileIcon size={20} className="text-amber-500" />;
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-slate-200 flex flex-col items-center justify-center p-6 font-sans overflow-hidden relative">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: "1s" }} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md z-10"
        >
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-[2.5rem] shadow-2xl p-8 overflow-hidden relative">
            <div className="flex items-center gap-4 mb-10">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                <ShieldCheck size={32} />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-white tracking-tight">PPChat</h1>
                <p className="text-slate-400 text-sm font-medium tracking-wide flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  PEER-TO-PEER ENCRYPTED
                </p>
              </div>
            </div>

            <div className="space-y-8">
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 ml-1">
                  Who are you?
                </label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors" size={20} />
                  <input
                    type="text"
                    placeholder="Enter username..."
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-800/50 border border-slate-700/50 rounded-2xl py-5 pl-12 pr-4 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all outline-none text-white placeholder:text-slate-600 font-medium"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 ml-1">
                    Room Name
                  </label>
                  <div className="relative group">
                    <Plus className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors" size={20} />
                    <input
                      type="text"
                      placeholder="e.g. secret-meeting"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleJoinOrCreate("join")}
                      className="w-full bg-slate-800/50 border border-slate-700/50 rounded-2xl py-5 pl-12 pr-4 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all outline-none text-white placeholder:text-slate-600 font-medium"
                    />
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-2 text-rose-400 text-xs font-bold bg-rose-500/10 p-3 rounded-xl border border-rose-500/20"
                    >
                      <AlertCircle size={14} />
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => handleJoinOrCreate("host")}
                    disabled={isConnecting}
                    className="flex flex-col items-center justify-center gap-3 bg-white text-slate-900 h-28 rounded-3xl hover:bg-slate-100 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isConnecting ? (
                      <Loader2 size={24} className="animate-spin" />
                    ) : (
                      <>
                        <Share2 size={28} />
                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">Create Room</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleJoinOrCreate("join")}
                    disabled={isConnecting}
                    className="flex flex-col items-center justify-center gap-3 bg-emerald-500 text-white h-28 rounded-3xl hover:bg-emerald-400 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                  >
                    {isConnecting ? (
                      <Loader2 size={24} className="animate-spin" />
                    ) : (
                      <>
                        <ChevronRight size={32} />
                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">Join Room</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <p className="text-[10px] text-center text-slate-500 font-bold uppercase tracking-[0.1em] px-4 opacity-70">
                Direct browser-to-browser connection.
                <br />Messages never touch a server.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0f172a] text-slate-200 flex flex-col font-sans overflow-hidden">
      <header className="bg-slate-900/50 backdrop-blur-md border-b border-slate-800/50 px-6 py-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-white leading-none tracking-tight">{currentRoom}</h2>
              <button
                onClick={copyRoomName}
                className="text-slate-500 hover:text-white transition-colors"
                title="Copy Room Name"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.15em]">
                {isHost ? `Hosting (${connections.length} active)` : "Connected P2P"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-2 text-slate-400 hover:text-rose-400 transition-all group px-4 py-2 hover:bg-rose-500/10 rounded-xl"
          >
            <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
            <span className="hidden sm:inline text-xs font-bold uppercase tracking-widest">Destroy</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="hidden lg:flex w-80 border-r border-slate-800/50 bg-slate-900/30 flex-col">
          <div className="p-5 border-b border-slate-800/50 bg-slate-900/20">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
              <Paperclip size={14} className="text-emerald-500" /> Shared Assets
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {messages.filter(m => m.file).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50 space-y-2">
                <FileIcon size={40} strokeWidth={1} />
                <p className="text-[10px] font-bold uppercase">No files shared yet</p>
              </div>
            ) : (
              messages.filter(m => m.file).map((msg) => (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={msg.id}
                  className="bg-slate-800/40 hover:bg-slate-800 transition-all p-3 rounded-2xl border border-slate-700/30 shadow-sm group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shrink-0 border border-slate-700/50">
                      {getFileIcon(msg.file!.type)}
                    </div>
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-xs font-bold truncate text-slate-200">{msg.file?.name}</p>
                      <p className="text-[10px] text-slate-500 font-medium">
                        {formatFileSize(msg.file?.size)} • {msg.sender}
                      </p>
                    </div>
                    <button
                      onClick={() => downloadFile(msg.file)}
                      className="w-8 h-8 flex items-center justify-center bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-lg transition-all"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-[#0f172a] relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[70%] bg-blue-500/5 rounded-full blur-[150px] -z-10 pointer-events-none" />

          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg, idx) => {
                if (msg.type === "system") {
                  return (
                    <div key={msg.id} className="flex justify-center my-6">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-full bg-slate-800/50 text-slate-500 border border-slate-700/30">
                        {msg.text}
                      </span>
                    </div>
                  );
                }

                const isMe = msg.sender === (username.trim() || "Anonymous");
                const showSender = idx === 0 || (messages[idx - 1].sender !== msg.sender || messages[idx - 1].type === "system");

                if (msg.file && !msg.text) {
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex flex-col w-full",
                        isMe ? "items-end" : "items-start"
                      )}
                    >
                      {showSender && (
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 px-1">
                          {msg.sender}
                        </span>
                      )}
                      <div className="max-w-sm bg-slate-800/60 backdrop-blur-sm border border-slate-700 p-4 rounded-[2rem] shadow-xl group">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shrink-0 border border-slate-600/30">
                            {getFileIcon(msg.file.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{msg.file.name}</p>
                            <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5 tracking-tight">
                              {formatFileSize(msg.file.size)}
                            </p>
                          </div>
                          <button
                            onClick={() => downloadFile(msg.file)}
                            className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
                          >
                            <Download size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex flex-col w-full",
                      isMe ? "items-end" : "items-start"
                    )}
                  >
                    {showSender && (
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 px-1">
                        {msg.sender}
                      </span>
                    )}
                    <div
                      className={cn(
                        "px-5 py-4 shadow-xl text-[15px] message-text leading-relaxed",
                        isMe
                          ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-[2rem] rounded-tr-sm max-w-[80%]"
                          : "bg-slate-800/80 backdrop-blur-sm text-slate-200 border border-slate-700/50 rounded-[2rem] rounded-tl-sm max-w-[80%]"
                      )}
                    >
                      {msg.text}
                    </div>
                    <span className="text-[9px] text-slate-600 mt-1 font-bold px-2">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <footer className="p-6 border-t border-slate-800/50 bg-slate-900/40 backdrop-blur-xl">
            <div className="max-w-3xl mx-auto">
              <form onSubmit={sendMessage} className="flex gap-3 items-end">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload Files"
                    className="w-12 h-12 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 rounded-2xl transition-all border border-slate-700/50 shadow-inner"
                  >
                    <Paperclip size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    title="Upload Folders"
                    className="w-12 h-12 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 rounded-2xl transition-all border border-slate-700/50 shadow-inner"
                  >
                    <FolderOpen size={20} />
                  </button>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => handleFileUpload(e)}
                  multiple
                  className="hidden"
                />
                <input
                  type="file"
                  ref={folderInputRef}
                  onChange={(e) => handleFileUpload(e)}
                  webkitdirectory=""
                  directory=""
                  className="hidden"
                />

                <div className="flex-1 relative">
                  <textarea
                    rows={1}
                    placeholder="Type a secure message..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    className="w-full bg-slate-800/80 border border-slate-700/50 rounded-[1.5rem] px-5 py-3.5 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 outline-none text-[15px] shadow-inner transition-all resize-none max-h-32 text-white placeholder:text-slate-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="w-12 h-12 flex items-center justify-center bg-emerald-500 text-white rounded-2xl hover:bg-emerald-400 transition-all disabled:opacity-30 disabled:grayscale shadow-lg shadow-emerald-500/20 active:scale-90"
                >
                  <Send size={20} />
                </button>
              </form>
            </div>
          </footer>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
        textarea::-webkit-scrollbar {
          display: none;
        }
        .message-text {
          word-break: break-word;
        }
      `}</style>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
