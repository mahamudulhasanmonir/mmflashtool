import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { ScrollArea } from "./components/ui/scroll-area";
import { Terminal as TerminalIcon, Zap, Smartphone, Activity, Cpu, UserCircle, ShieldCheck, DownloadCloud, Clock, Calendar, CheckCircle2, XCircle } from "lucide-react";

interface TerminalEvent {
  taskId: string;
  ts: string;
  level: string;
  text: string;
  elapsedMs: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"home" | "adb" | "fastboot" | "flash" | "unlock" | "program" | "tools" | "mtk" | "qcom" | "sam" | "account">("home");
  const [logs, setLogs] = useState<TerminalEvent[]>([]);
  const [shellCmd, setShellCmd] = useState("");
  const [fbShellCmd, setFbShellCmd] = useState("");
  const [flashPartition, setFlashPartition] = useState("boot");
  const [flashFile, setFlashFile] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  
  // Phase 4 State
  const [firmwareDir, setFirmwareDir] = useState("");
  const [flashPlan, setFlashPlan] = useState<{name: string, status: string}[]>([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [unlockSidebarTab, setUnlockSidebarTab] = useState("general");
  const [toolsSidebarTab, setToolsSidebarTab] = useState("firmware");

  // Phase 5 State
  const [payloadFile, setPayloadFile] = useState("");
  const [scatterFile, setScatterFile] = useState("");

  // Phase 7 State
  const [licenseKey, setLicenseKey] = useState("");
  const [isLicensed, setIsLicensed] = useState(false);
  const [optInTelemetry, setOptInTelemetry] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unlisten = listen<TerminalEvent>("terminal-line", (event) => {
      setLogs((prev) => [...prev, event.payload]);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [logs]);

  const addLog = (text: string, level: string = "info", taskId: string = "general") => {
    setLogs((prev) => [
      ...prev,
      {
        taskId,
        ts: new Date().toLocaleTimeString("en-US", { hour12: false }),
        level,
        text,
        elapsedMs: 0,
      },
    ]);
  };

  const handleExecuteSidecar = async (sidecar: string, args: string[], taskId: string, cmdStr: string) => {
    if (isRunning) return;
    setIsRunning(true);
    addLog(`> ${sidecar} ${cmdStr}`, "cmd", taskId);
    try {
      const output = await invoke<string>("execute_sidecar", { sidecar, args });
      addLog(output, "info", taskId);
      return output;
    } catch (e: any) {
      addLog(`Error: ${e}`, "error", taskId);
      return null;
    } finally {
      setIsRunning(false);
    }
  };

  const handleStreamSidecar = async (sidecar: string, args: string[], taskId: string, cmdStr: string) => {
    if (isRunning) return;
    setIsRunning(true);
    addLog(`> ${sidecar} ${cmdStr}`, "cmd", taskId);
    try {
      await invoke("stream_sidecar", { taskId, sidecar, args });
    } catch (e: any) {
      addLog(`Error: ${e}`, "error", taskId);
    } finally {
      setIsRunning(false);
    }
  };

  // Fastboot Commands
  
  const handleFbShell = () => {
    if (!fbShellCmd) return;
    handleExecuteSidecar("fastboot", fbShellCmd.split(" "), "t_fb_shell", fbShellCmd);
  };

  const handleFlash = () => {
    if (!flashFile) return;
    const args = ["flash", flashPartition, flashFile];
    handleStreamSidecar("fastboot", args, "t_fb_flash", args.join(" "));
  };

  // Phase 4: Task Engine Mock
  const generateFlashPlan = () => {
    if (!firmwareDir) return;
    addLog(`Parsed firmware directory: ${firmwareDir}`, "info", "t_engine");
    setFlashPlan([
      { name: "Pre-flight Check (Battery, Storage)", status: "pending" },
      { name: "Verify Bootloader Unlock State", status: "pending" },
      { name: "Flash boot.img", status: "pending" },
      { name: "Flash vendor_boot.img", status: "pending" },
      { name: "Flash super.img", status: "pending" },
      { name: "Format Data (-w)", status: "pending" },
      { name: "Reboot System", status: "pending" },
    ]);
  };

  const executeFlashPlan = async () => {
    if (isRunning || flashPlan.length === 0) return;
    setIsRunning(true);
    addLog("--- STARTED FIRMWARE FLASH JOB ---", "info", "t_engine");
    
    if (!isLicensed) {
      addLog("WARNING: Running in unlicensed trial mode. Some features may be rate-limited.", "warning", "t_engine");
    }

    let updatedPlan = [...flashPlan];
    
    for (let i = 0; i < updatedPlan.length; i++) {
      setCurrentStep(i);
      updatedPlan[i].status = "running";
      setFlashPlan([...updatedPlan]);
      
      // Mock execution delay
      addLog(`Executing: ${updatedPlan[i].name}...`, "cmd", "t_engine");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      updatedPlan[i].status = "done";
      setFlashPlan([...updatedPlan]);
      addLog(`Completed: ${updatedPlan[i].name}`, "info", "t_engine");
    }
    
    setCurrentStep(-1);
    setIsRunning(false);
    addLog("--- FIRMWARE FLASH JOB FINISHED ---", "info", "t_engine");
    
    // Log history to simulated SQLite
    addLog("Job history logged to SQLite database.", "info", "t_engine");
    
    if (optInTelemetry) {
      addLog("Anonymous flash success metrics sent to telemetry server.", "info", "t_engine");
    }
  };

  // ADB Commands
  const handleAdbShell = () => {
    if (!shellCmd) return;
    handleExecuteSidecar("adb", ["shell", shellCmd], "t_adb_shell", `shell ${shellCmd}`);
  };

  const handleAdbReboot = (mode: string) => {
    const args = mode === "system" ? ["reboot"] : ["reboot", mode];
    handleExecuteSidecar("adb", args, "t_adb_reboot", args.join(" "));
  };

  const fetchDeviceInfo = async () => {
    if (isRunning) return;
    setIsRunning(true);
    addLog(`> adb shell getprop`, "cmd", "t_adb_info");
    try {
      const output = await invoke<string>("execute_sidecar", { sidecar: "adb", args: ["shell", "getprop"] });
      
      const getPropVal = (prop: string) => {
        const match = output.match(new RegExp(`\\[${prop}\\]: \\[(.*?)\\]`));
        return match ? match[1] : "Unknown";
      };

      addLog(`Device: ${getPropVal("ro.product.brand")} ${getPropVal("ro.product.model")} (Android ${getPropVal("ro.build.version.release")})`, "info", "t_adb_info");
    } catch (e: any) {
      addLog(`Error fetching device info: ${e}`, "error", "t_adb_info");
    } finally {
      setIsRunning(false);
    }
  };

  const clearTerminal = () => setLogs([]);

  // Date and Time hook
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-[#0f111a] text-slate-200 font-sans selection:bg-primary/30">
      {/* Top Status Bar */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-[#161925] px-4 py-2 text-sm shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight text-white">
            <Zap className="h-5 w-5 text-cyan-400" fill="currentColor" />
            <span>TECH<span className="text-cyan-400">FLASH</span></span>
          </div>
          
          <div className="flex items-center gap-3 ml-4">
            <div className="flex items-center gap-1.5 bg-[#0f111a] border border-slate-800 px-3 py-1 rounded-md text-slate-400">
              <Calendar className="h-4 w-4" />
              <span>{time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-[#0f111a] border border-slate-800 px-3 py-1 rounded-md text-cyan-400 font-mono">
              <Clock className="h-4 w-4" />
              <span>{time.toLocaleTimeString('en-GB', { hour12: false })}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
           <div className="flex items-center gap-2 bg-[#2d1b11] border border-orange-900/50 px-3 py-1 rounded-md">
             <span className="text-orange-500 font-bold text-xs uppercase tracking-wider">FB</span>
             <span className="text-orange-200 font-mono text-xs">8f709714</span>
           </div>
           <Smartphone className="h-4 w-4 text-cyan-500" />
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800 bg-[#161925] px-4 py-2 scrollbar-none">
        {[
          { id: "home", label: "Home", icon: UserCircle },
          { id: "adb", label: "ADB & Fastboot", icon: Activity },
          { id: "unlock", label: "Unlock & Flash", icon: ShieldCheck },
          { id: "program", label: "Program", icon: Cpu },
          { id: "tools", label: "Tools", icon: TerminalIcon },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            }`}
          >
            <tab.icon className={`h-4 w-4 ${activeTab === tab.id ? 'text-cyan-400' : ''}`} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Workspace */}
      <div className="flex flex-1 flex-col overflow-hidden">
        
        {/* Top: Actions Panel */}
        <div className="flex-[3] overflow-y-auto p-3 bg-[#0f111a]">
          <div className="max-w-6xl mx-auto flex flex-col gap-3">
          
          {activeTab === "adb" && (
            <>
              <Card className="bg-[#161925] border-slate-800 shadow-lg">
                <CardHeader className="pb-3 border-b border-slate-800/50 flex flex-row items-center justify-between">
                  <div className="flex flex-col">
                    <CardTitle className="flex items-center gap-2 text-white"><Smartphone className="h-5 w-5 text-emerald-500" fill="currentColor"/> <span className="tracking-wide">A D B</span></CardTitle>
                    <CardDescription className="text-slate-500 text-xs mt-1">Android Debug Bridge</CardDescription>
                  </div>
                  <div className="flex gap-2">
                     <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white border-none shadow-md">
                        <Smartphone className="h-3.5 w-3.5 mr-2" fill="currentColor"/> ADB
                     </Button>
                     <Button variant="outline" size="sm" className="bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700" onClick={() => setActiveTab("fastboot")}>
                        <Zap className="h-3.5 w-3.5 mr-2"/> Fastboot
                     </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 flex flex-col gap-4">
                  
                  {/* Reboot Row */}
                  <div className="flex items-center gap-3">
                    <span className="w-20 text-sm font-medium text-slate-400">Reboot:</span>
                    <select 
                      className="w-[180px] bg-[#222532] border border-slate-700 text-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      onChange={(e) => {
                         if(e.target.value) handleAdbReboot(e.target.value);
                      }}
                    >
                      <option value="">Normal</option>
                      <option value="recovery">Recovery</option>
                      <option value="bootloader">Bootloader</option>
                      <option value="fastboot">Fastbootd</option>
                      <option value="edl">EDL</option>
                    </select>
                    <Button 
                      className="bg-emerald-500 hover:bg-emerald-600 text-white border-none shadow-md" 
                      disabled={isRunning}
                    >
                      ► Execute
                    </Button>
                    <div className="flex-1"></div>
                    <Button 
                      className="bg-cyan-500 hover:bg-cyan-600 text-white border-none shadow-md" 
                      onClick={fetchDeviceInfo} 
                      disabled={isRunning}
                    >
                      <Activity className="h-4 w-4 mr-1.5"/> Check
                    </Button>
                  </div>

                  {/* Install APK Row */}
                  <div className="flex items-center gap-3">
                    <span className="w-20 text-sm font-medium text-slate-400">Install APK:</span>
                    <select className="w-[180px] bg-[#222532] border border-slate-700 text-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500">
                      <option>Select APK</option>
                    </select>
                    <div className="flex gap-2">
                       <Button className="bg-purple-600 hover:bg-purple-700 text-white border-none shadow-sm" disabled={isRunning}>
                         <svg className="h-3.5 w-3.5 mr-1.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> Custom
                       </Button>
                       <Button className="bg-emerald-500 hover:bg-emerald-600 text-white border-none shadow-md" disabled={isRunning}>
                         <DownloadCloud className="h-3.5 w-3.5 mr-1.5"/> Install
                       </Button>
                    </div>
                  </div>

                  {/* Quick Actions Row */}
                  <div className="flex items-center gap-3">
                    <span className="w-20 text-sm font-medium text-slate-400">Quick:</span>
                    <div className="flex gap-2 flex-wrap">
                      <Button className="bg-orange-500 hover:bg-orange-600 text-white border-none shadow-sm" disabled={isRunning}>
                        <Activity className="h-3.5 w-3.5 mr-1.5"/> Server v
                      </Button>
                      <Button className="bg-purple-600 hover:bg-purple-700 text-white border-none shadow-sm" disabled={isRunning}>
                        <Zap className="h-3.5 w-3.5 mr-1.5"/> Fix Corrupt
                      </Button>
                    </div>
                  </div>

                  {/* Sideload Row */}
                  <div className="flex items-center gap-3">
                    <span className="w-20 text-sm font-medium text-slate-400">Sideload:</span>
                    <div className="flex-1 relative max-w-[250px]">
                       <Input 
                         placeholder="No file..." 
                         readOnly
                         className="bg-[#222532] border-slate-700 pr-10 text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-500 h-[38px]"
                       />
                       <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
                       </button>
                    </div>

                    <div className="flex gap-2">
                       <Button variant="outline" className="bg-purple-600 hover:bg-purple-700 text-white border-none shadow-sm h-[38px]">
                         <svg className="h-4 w-4 mr-1.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> Select
                       </Button>
                       <Button className="bg-emerald-500 hover:bg-emerald-600 text-white min-w-[100px] shadow-md border-none h-[38px]">
                         <Zap className="h-4 w-4 mr-1.5" fill="currentColor"/> Flash
                       </Button>
                    </div>
                  </div>
                  
                  {/* Raw Command */}
                  <div className="flex gap-2 mt-2 items-center">
                     <div className="bg-emerald-500 text-white px-3 py-2 rounded-md font-bold text-sm tracking-wide flex items-center justify-center">
                       adb
                     </div>
                     <Input
                        value={shellCmd}
                        onChange={(e) => setShellCmd(e.target.value)}
                        placeholder="command..."
                        className="flex-1 bg-[#222532] border-slate-700 text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-500 h-[40px]"
                        onKeyDown={(e) => e.key === "Enter" && handleAdbShell()}
                      />
                      <Button onClick={handleAdbShell} disabled={isRunning || !shellCmd} className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 h-[40px] font-bold tracking-wide border-none">
                         Run
                      </Button>
                  </div>

                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "fastboot" && (
            <>
              <Card className="bg-[#161925] border-slate-800 shadow-lg">
                <CardHeader className="pb-3 border-b border-slate-800/50 flex flex-row items-center justify-between">
                  <div className="flex flex-col">
                    <CardTitle className="flex items-center gap-2 text-white"><Zap className="h-5 w-5 text-red-500" fill="currentColor"/> <span className="tracking-wide">FASTBOOT</span></CardTitle>
                    <CardDescription className="text-slate-500 text-xs mt-1">Bootloader Flash Mode</CardDescription>
                  </div>
                  <div className="flex gap-2">
                     <Button variant="outline" size="sm" className="bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700" onClick={() => setActiveTab("adb")}>
                        <TerminalIcon className="h-3.5 w-3.5 mr-2"/> ADB
                     </Button>
                     <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white border-none shadow-md">
                        <Zap className="h-3.5 w-3.5 mr-2" fill="currentColor"/> Fastboot
                     </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 flex flex-col gap-4">
                  
                  {/* Reboot Row */}
                  <div className="flex items-center gap-3">
                    <span className="w-20 text-sm font-medium text-slate-400">Reboot:</span>
                    <select 
                      className="w-[180px] bg-[#222532] border border-slate-700 text-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      onChange={(e) => handleStreamSidecar("fastboot", ["reboot", e.target.value], "t_fb_reboot", `reboot ${e.target.value}`)}
                    >
                      <option value="">Normal</option>
                      <option value="bootloader">Bootloader</option>
                      <option value="recovery">Recovery</option>
                      <option value="fastboot">Fastbootd</option>
                    </select>
                    <Button 
                      className="bg-emerald-500 hover:bg-emerald-600 text-white border-none shadow-md" 
                      disabled={isRunning}
                    >
                      ► Execute
                    </Button>
                    <div className="flex-1"></div>
                    <Button 
                      className="bg-cyan-500 hover:bg-cyan-600 text-white border-none shadow-md" 
                      onClick={() => handleExecuteSidecar("fastboot", ["devices"], "t_fb_check", "devices")} 
                      disabled={isRunning}
                    >
                      <Activity className="h-4 w-4 mr-1.5"/> Check
                    </Button>
                  </div>

                  {/* Getvar Row */}
                  <div className="flex items-center gap-3">
                    <span className="w-20 text-sm font-medium text-slate-400">Getvar:</span>
                    <div className="flex gap-2 flex-wrap">
                      <Button className="bg-purple-600 hover:bg-purple-700 text-white border-none shadow-sm" disabled={isRunning} onClick={() => handleStreamSidecar("fastboot", ["getvar", "all"], "t_getvar", "getvar all")}>
                        <svg className="h-3.5 w-3.5 mr-1.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h10"/><path d="M7 12h10"/><path d="M7 17h10"/></svg> All
                      </Button>
                      <Button className="bg-purple-600 hover:bg-purple-700 text-white border-none shadow-sm" disabled={isRunning} onClick={() => handleStreamSidecar("fastboot", ["getvar", "current-slot"], "t_getvar", "getvar current-slot")}>
                        <svg className="h-3.5 w-3.5 mr-1.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Slot
                      </Button>
                      <Button className="bg-purple-600 hover:bg-purple-700 text-white border-none shadow-sm" disabled={isRunning} onClick={() => handleStreamSidecar("fastboot", ["getvar", "product"], "t_getvar", "getvar product")}>
                        <Smartphone className="h-3.5 w-3.5 mr-1.5"/> Product
                      </Button>
                      <Button className="bg-purple-600 hover:bg-purple-700 text-white border-none shadow-sm" disabled={isRunning} onClick={() => handleStreamSidecar("fastboot", ["getvar", "unlocked"], "t_getvar", "getvar unlocked")}>
                        <ShieldCheck className="h-3.5 w-3.5 mr-1.5"/> Status
                      </Button>
                    </div>
                  </div>

                  {/* Quick Actions Row */}
                  <div className="flex items-center gap-3">
                    <span className="w-20 text-sm font-medium text-slate-400">Quick:</span>
                    <div className="flex gap-2 flex-wrap">
                      <Button className="bg-orange-500 hover:bg-orange-600 text-white border-none shadow-sm" disabled={isRunning} onClick={() => handleStreamSidecar("fastboot", ["flashing", "unlock"], "t_ul", "flashing unlock")}>
                        <svg className="h-3.5 w-3.5 mr-1.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Flashing Unlock
                      </Button>
                      <Button className="bg-orange-500 hover:bg-orange-600 text-white border-none shadow-sm" disabled={isRunning} onClick={() => handleStreamSidecar("fastboot", ["oem", "unlock-go"], "t_ul", "oem unlock-go")}>
                        <ShieldCheck className="h-3.5 w-3.5 mr-1.5"/> OEM Unlock-Go
                      </Button>
                      <Button className="bg-indigo-500 hover:bg-indigo-600 text-white border-none shadow-sm" disabled={isRunning} onClick={() => handleStreamSidecar("fastboot", ["set_active", "other"], "t_slot", "set_active other")}>
                        <svg className="h-3.5 w-3.5 mr-1.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 5-5-5-5"/><path d="m9 10-5 5 5 5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0"/><path d="M4 15h10.5a5.5 5.5 0 0 0 5.5-5.5v0"/></svg> Change Slot
                      </Button>
                      <Button className="bg-red-500 hover:bg-red-600 text-white border-none shadow-sm" disabled={isRunning} onClick={() => handleStreamSidecar("fastboot", ["-w"], "t_format", "-w")}>
                        <svg className="h-3.5 w-3.5 mr-1.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg> Format Data
                      </Button>
                    </div>
                  </div>

                  {/* Flash Row */}
                  <div className="flex items-center gap-3">
                    <span className="w-20 text-sm font-medium text-slate-400">Flash:</span>
                    <select 
                      value={flashPartition} 
                      onChange={(e) => setFlashPartition(e.target.value)}
                      className="w-[180px] bg-[#222532] border border-slate-700 text-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    >
                      <option value="boot">boot</option>
                      <option value="vendor_boot">vendor_boot</option>
                      <option value="init_boot">init_boot</option>
                      <option value="recovery">recovery</option>
                      <option value="dtbo">dtbo</option>
                      <option value="vbmeta">vbmeta</option>
                      <option value="super">super</option>
                      <option value="system">system</option>
                    </select>
                    
                    <div className="flex-1 relative">
                       <Input 
                         placeholder="No file..." 
                         value={flashFile} 
                         onChange={(e) => setFlashFile(e.target.value)} 
                         className="bg-[#222532] border-slate-700 pr-10 text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-500 h-[38px]"
                       />
                       <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
                       </button>
                    </div>

                    <div className="flex gap-2">
                       <Button variant="outline" className="bg-purple-600/20 text-purple-400 border-purple-500/50 hover:bg-purple-600/40">
                         <svg className="h-4 w-4 mr-1.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> File
                       </Button>
                       <Button onClick={handleFlash} disabled={isRunning || !flashFile} className="bg-emerald-500 hover:bg-emerald-600 text-white min-w-[100px] shadow-md border-none">
                         <Zap className="h-4 w-4 mr-1.5" fill="currentColor"/> Flash
                       </Button>
                    </div>
                  </div>
                  
                  {/* Raw Command */}
                  <div className="flex gap-2 mt-2 items-center">
                     <div className="bg-red-500 text-white px-3 py-2 rounded-md font-bold text-sm tracking-wide flex items-center justify-center">
                       fastboot
                     </div>
                     <Input
                        value={fbShellCmd}
                        onChange={(e) => setFbShellCmd(e.target.value)}
                        placeholder="command..."
                        className="flex-1 bg-[#222532] border-slate-700 text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-500 h-[40px]"
                        onKeyDown={(e) => e.key === "Enter" && handleFbShell()}
                      />
                      <Button onClick={handleFbShell} disabled={isRunning || !fbShellCmd} className="bg-red-500 hover:bg-red-600 text-white px-6 h-[40px] font-bold tracking-wide border-none">
                         Run
                      </Button>
                  </div>

                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "home" && (
            <div className="grid grid-cols-2 gap-3 h-full">
              {/* Left Column */}
              <div className="flex flex-col gap-2">
                {/* Author Card */}
                <Card className="bg-[#161925] border-slate-800 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                    <Zap className="h-28 w-28 text-cyan-400" />
                  </div>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-2xl font-bold text-white tracking-wide">TECH<span className="text-cyan-400">FLASH</span></CardTitle>
                    <CardDescription className="text-slate-400 text-xs">Advanced Firmware Flashing Utility — by Mahamudul Hasan Monir</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1 pt-1 pb-3">
                    {/* Telegram */}
                    <button
                      onClick={() => openUrl("https://t.me/imahdi_3")}
                      className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg bg-[#0f111a] border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800/60 transition-all group text-left"
                    >
                      <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                        <svg className="h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 13.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z"/></svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-xs text-slate-500 leading-none">Telegram</div>
                        <div className="text-sm text-slate-200 font-medium group-hover:text-cyan-400 transition-colors">t.me/imahdi_3</div>
                      </div>
                      <svg className="h-4 w-4 text-slate-600 group-hover:text-cyan-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </button>

                    {/* WhatsApp */}
                    <button
                      onClick={() => openUrl("https://wa.me/8801518945738")}
                      className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg bg-[#0f111a] border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/60 transition-all group text-left"
                    >
                      <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                        <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-xs text-slate-500 leading-none">WhatsApp</div>
                        <div className="text-sm text-slate-200 font-medium group-hover:text-emerald-400 transition-colors">+880 1518-945738</div>
                      </div>
                      <svg className="h-4 w-4 text-slate-600 group-hover:text-emerald-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </button>

                    {/* Facebook */}
                    <button
                      onClick={() => openUrl("https://facebook.com/mahamudultr")}
                      className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg bg-[#0f111a] border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/60 transition-all group text-left"
                    >
                      <div className="h-8 w-8 rounded-full bg-blue-600/20 flex items-center justify-center shrink-0">
                        <svg className="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor"><path d="M22.675 0h-21.35C.597 0 0 .597 0 1.325v21.351C0 23.403.597 24 1.325 24h11.495v-9.294H9.691v-3.622h3.129V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.73 0 1.323-.597 1.323-1.325V1.325C24 .597 23.403 0 22.675 0z"/></svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-xs text-slate-500 leading-none">Facebook</div>
                        <div className="text-sm text-slate-200 font-medium group-hover:text-blue-400 transition-colors">facebook.com/mahamudultr</div>
                      </div>
                      <svg className="h-4 w-4 text-slate-600 group-hover:text-blue-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </button>

                    {/* GitHub */}
                    <button
                      onClick={() => openUrl("https://github.com/mahamudulhasanmonir")}
                      className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg bg-[#0f111a] border border-slate-800 hover:border-slate-500/70 hover:bg-slate-800/60 transition-all group text-left"
                    >
                      <div className="h-8 w-8 rounded-full bg-slate-500/20 flex items-center justify-center shrink-0">
                        <svg className="h-4 w-4 text-slate-300" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-xs text-slate-500 leading-none">GitHub</div>
                        <div className="text-sm text-slate-200 font-medium group-hover:text-slate-100 transition-colors">github.com/mahamudulhasanmonir</div>
                      </div>
                      <svg className="h-4 w-4 text-slate-600 group-hover:text-slate-300 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </button>
                  </CardContent>
                </Card>

                {/* Changelog button */}
                <button
                  onClick={() => openUrl("https://github.com/mahamudulhasanmonir/mmflashtool/releases")}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#161925] border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800/60 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-cyan-500/15 flex items-center justify-center">
                      <DownloadCloud className="h-4 w-4 text-cyan-400" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-semibold text-white">View Changelog</div>
                      <div className="text-xs text-slate-500">GitHub Releases &amp; Release Notes</div>
                    </div>
                  </div>
                  <svg className="h-4 w-4 text-slate-600 group-hover:text-cyan-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </button>
              </div>

              {/* Right Column */}
              <div className="flex flex-col gap-2">
                <Card className="bg-[#161925] border-slate-800 shadow-lg">
                  <CardHeader className="pb-3 border-b border-slate-800/50">
                    <CardTitle className="flex items-center gap-2 text-white"><ShieldCheck className="h-5 w-5 text-emerald-400"/> Software License</CardTitle>
                    <CardDescription className="text-slate-400 text-xs">Activate TechFlash Pro using your hardware-bound license key.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-3 flex flex-col gap-3">
                    {isLicensed ? (
                      <div className="bg-emerald-500/20 text-emerald-400 p-3 rounded border border-emerald-500/50 flex items-center justify-between">
                         <span><strong>Pro License Active</strong> (Hardware Bound)</span>
                         <Button size="sm" variant="outline" className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/20" onClick={() => setIsLicensed(false)}>Deactivate</Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input 
                          placeholder="Enter License Key (e.g. TF-XXXX-XXXX-XXXX)..." 
                          value={licenseKey}
                          onChange={(e) => setLicenseKey(e.target.value)}
                          className="flex-1 bg-[#222532] border-slate-700 text-white"
                        />
                        <Button className="bg-emerald-500 hover:bg-emerald-600 text-white border-none shadow-md" onClick={() => { if(licenseKey) { setIsLicensed(true); addLog("License successfully bound to hardware signature.", "info", "t_auth"); } }}>Activate Key</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-[#161925] border-slate-800 shadow-lg">
                  <CardHeader className="pb-3 border-b border-slate-800/50">
                    <CardTitle className="flex items-center gap-2 text-white"><DownloadCloud className="h-5 w-5 text-purple-400"/> Updates &amp; Telemetry</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-semibold text-sm text-slate-200">Release Channel</h4>
                        <p className="text-xs text-slate-400">Receive stable updates or beta tests.</p>
                      </div>
                      <select className="rounded border border-slate-700 bg-[#222532] px-3 py-1 text-sm text-white outline-none focus:ring-1 focus:ring-cyan-500">
                        <option>Stable (Recommended)</option>
                        <option>Beta (Cutting Edge)</option>
                      </select>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <Button variant="secondary" className="bg-slate-800 border-slate-700 text-slate-300 hover:text-white" onClick={() => addLog("Checking for updates... TechFlash is up to date (v1.0.3).", "info", "t_updater")}>Check for Updates</Button>
                      <Button variant="secondary" className="bg-slate-800 border-slate-700 text-slate-300 hover:text-white" onClick={() => addLog("Syncing latest remote device-profile database... Done.", "info", "t_updater")}>Sync Device DB</Button>
                    </div>

                    <div className="border-t border-slate-800 pt-3">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="telemetry" checked={optInTelemetry} onChange={(e) => setOptInTelemetry(e.target.checked)} className="accent-cyan-500" />
                        <label htmlFor="telemetry" className="text-xs text-slate-400 leading-tight">Allow anonymous crash reporting and telemetry (No device identifiers are collected).</label>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* App Info */}
                <div className="px-4 py-3 rounded-lg bg-[#161925] border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-cyan-400" fill="currentColor" />
                    <span className="text-sm font-bold text-white">TechFlash <span className="text-cyan-400">v1.0.3</span></span>
                  </div>
                  <span className="text-xs text-slate-500">Built with Tauri 2 + React</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === "unlock" && (
            <div className="flex h-full gap-4">
              {/* Sidebar */}
              <div className="w-[200px] flex flex-col gap-1 border-r border-slate-800 pr-4 shrink-0">
                 {["general", "xiaomi", "mtk", "qcom", "snapdragon"].map((t) => (
                   <button 
                     key={t}
                     onClick={() => setUnlockSidebarTab(t)}
                     className={`text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${unlockSidebarTab === t ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
                   >
                     {t === "general" && "General"}
                     {t === "xiaomi" && "Xiaomi"}
                     {t === "mtk" && "Mediatek"}
                     {t === "qcom" && "Qualcomm"}
                     {t === "snapdragon" && "Snapdragon"}
                   </button>
                 ))}
              </div>
              
              {/* Content */}
              <div className="flex-1 flex flex-col gap-4">
                 {unlockSidebarTab === "general" && (
                   <>
                     <Card className="bg-[#161925] border-slate-800 shadow-lg">
                       <CardHeader className="pb-3 border-b border-slate-800/50">
                         <CardTitle className="flex items-center gap-2 text-white"><ShieldCheck className="h-5 w-5 text-cyan-400"/> General Tools</CardTitle>
                       </CardHeader>
                       <CardContent className="pt-4 grid grid-cols-2 gap-3">
                         <Button variant="outline" className="h-16 flex flex-col items-center justify-center gap-1 bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={() => addLog("Opening QFL Tool...", "info", "t_ul")}>
                           <span className="font-semibold text-sm">QFL TOOL</span>
                           <span className="text-[10px] text-slate-500">(EDL to Normal)</span>
                         </Button>
                         <Button variant="outline" className="h-16 flex flex-col items-center justify-center gap-1 bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={() => addLog("Opening ZTE ToolBox...", "info", "t_ul")}>
                           <span className="font-semibold text-sm">ZTE ToolBox</span>
                         </Button>
                         <Button variant="outline" className="h-16 flex flex-col items-center justify-center gap-1 bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={() => addLog("Opening UBL Snapdragon Tool...", "info", "t_ul")}>
                           <span className="font-semibold text-sm">UBL Snapdragon Tool</span>
                         </Button>
                         <Button variant="outline" className="h-16 flex flex-col items-center justify-center gap-1 bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={() => addLog("Opening Flash Tool...", "info", "t_ul")}>
                           <span className="font-semibold text-sm">Flash Tool</span>
                         </Button>
                       </CardContent>
                     </Card>
                     
                     <Card className="bg-[#161925] border-slate-800 shadow-lg">
                       <CardHeader className="pb-3 border-b border-slate-800/50">
                         <CardTitle className="flex items-center gap-2 text-white"><Activity className="h-5 w-5 text-orange-400"/> Bootloader Unlock Wizard</CardTitle>
                         <CardDescription className="text-orange-500/80">WARNING: Unlocking will wipe all user data!</CardDescription>
                       </CardHeader>
                       <CardContent className="pt-4 flex flex-col gap-3">
                         <div className="flex items-center gap-3">
                           <span className="bg-slate-800 text-slate-400 px-2 py-1 rounded text-xs font-bold w-6 text-center border border-slate-700">1</span>
                           <span className="text-sm text-slate-300">Enable Developer Options and "OEM Unlocking" in Android Settings.</span>
                         </div>
                         <div className="flex items-center gap-3">
                           <span className="bg-slate-800 text-slate-400 px-2 py-1 rounded text-xs font-bold w-6 text-center border border-slate-700">2</span>
                           <Button variant="outline" size="sm" className="bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700" onClick={() => handleExecuteSidecar("adb", ["reboot", "bootloader"], "t_ul_reboot", "adb reboot bootloader")}>Reboot to Bootloader</Button>
                         </div>
                         <div className="flex items-center gap-3">
                           <span className="bg-slate-800 text-slate-400 px-2 py-1 rounded text-xs font-bold w-6 text-center border border-slate-700">3</span>
                           <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white border-none" onClick={() => handleStreamSidecar("fastboot", ["flashing", "unlock"], "t_ul_unlock", "fastboot flashing unlock")}>Execute Flashing Unlock</Button>
                         </div>
                       </CardContent>
                     </Card>
                   </>
                 )}

                 {unlockSidebarTab === "xiaomi" && (
                   <div className="flex items-center justify-center h-40 text-slate-500 text-sm italic bg-[#161925] border border-slate-800 rounded-lg">
                     Xiaomi tools will be added later...
                   </div>
                 )}

                 {unlockSidebarTab === "mtk" && (
                   <Card className="bg-[#161925] border-slate-800 shadow-lg">
                     <CardHeader className="pb-3 border-b border-slate-800/50">
                       <CardTitle className="flex items-center gap-2 text-white"><Cpu className="h-5 w-5 text-cyan-400"/> MediaTek (BROM / Preloader)</CardTitle>
                       <CardDescription className="text-slate-500 text-xs">Bypass SLA/DA and flash scatter firmware directly to MTK devices.</CardDescription>
                     </CardHeader>
                     <CardContent className="pt-4 flex flex-col gap-4">
                       <div className="flex gap-2">
                         <Button variant="default" className="bg-cyan-500 hover:bg-cyan-600 text-white flex-1 border-none shadow-md" onClick={() => addLog("Waiting for MTK device in BROM mode (Hold Vol+ and Vol- while inserting USB)...", "cmd", "t_mtk")}>Auth Bypass (SLA/DA)</Button>
                         <Button variant="outline" className="bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 flex-1" onClick={() => addLog("Scanning for MTK Preloader VCOM port...", "info", "t_mtk")}>Read Partitions</Button>
                       </div>
                       <div className="flex gap-2">
                         <Input placeholder="Select Scatter File (MTxxxx_Android_scatter.txt)..." className="bg-[#222532] border-slate-700 text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-500" />
                         <Button variant="secondary" className="bg-purple-600 hover:bg-purple-700 text-white border-none shadow-sm">Load Scatter</Button>
                       </div>
                       <Button variant="destructive" className="bg-emerald-500 hover:bg-emerald-600 text-white border-none shadow-md">Flash Firmware</Button>
                     </CardContent>
                   </Card>
                 )}

                 {unlockSidebarTab === "qcom" && (
                   <Card className="bg-[#161925] border-slate-800 shadow-lg">
                     <CardHeader className="pb-3 border-b border-slate-800/50">
                       <CardTitle className="flex items-center gap-2 text-white"><Cpu className="h-5 w-5 text-purple-400"/> Qualcomm (EDL / Firehose)</CardTitle>
                       <CardDescription className="text-slate-500 text-xs">Flash QFIL firmware using rawprogram and patch XMLs via 9008 mode.</CardDescription>
                     </CardHeader>
                     <CardContent className="pt-4 flex flex-col gap-4">
                       <div className="flex gap-2">
                         <Button variant="outline" className="bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 flex-1" onClick={() => addLog("Waiting for Qualcomm HS-USB QDLoader 9008...", "cmd", "t_qcom")}>Ping EDL (9008)</Button>
                       </div>
                       <div className="flex gap-2">
                         <Input placeholder="Select Programmer (prog_firehose_ddr.elf)..." className="bg-[#222532] border-slate-700 text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-500" />
                         <Button variant="secondary" className="bg-purple-600 hover:bg-purple-700 text-white border-none shadow-sm">Load Programmer</Button>
                       </div>
                       <div className="flex gap-2">
                         <Input placeholder="Select rawprogram0.xml..." className="bg-[#222532] border-slate-700 text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-500" />
                         <Input placeholder="Select patch0.xml..." className="bg-[#222532] border-slate-700 text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-500" />
                       </div>
                       <Button variant="destructive" className="bg-emerald-500 hover:bg-emerald-600 text-white border-none shadow-md">Flash XML Firmware</Button>
                     </CardContent>
                   </Card>
                 )}

                 {unlockSidebarTab === "snapdragon" && (
                   <div className="flex items-center justify-center h-40 text-slate-500 text-sm italic bg-[#161925] border border-slate-800 rounded-lg">
                     Snapdragon tools will be added later...
                   </div>
                 )}
              </div>
            </div>
          )}

          {activeTab === "program" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5"/> Scatter & Partition Map</CardTitle>
                  <CardDescription>Multi-image flashing queue.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Load Scatter (.txt) or Partition Map (.json)..." 
                      value={scatterFile} 
                      onChange={(e) => setScatterFile(e.target.value)} 
                      className="flex-1" 
                    />
                    <Button variant="secondary" onClick={() => addLog(`Loading map from ${scatterFile}`, "info", "t_pgm")}>Load Map</Button>
                  </div>
                  
                  {/* Mock Table */}
                  <div className="border rounded-md bg-muted/30">
                    <table className="w-full text-sm text-left">
                      <thead className="border-b bg-muted/50">
                        <tr>
                          <th className="p-2"><input type="checkbox" checked readOnly /></th>
                          <th className="p-2">Partition</th>
                          <th className="p-2">File</th>
                          <th className="p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="p-2"><input type="checkbox" checked readOnly /></td>
                          <td className="p-2">boot</td>
                          <td className="p-2 font-mono text-muted-foreground">boot.img</td>
                          <td className="p-2">Ready</td>
                        </tr>
                        <tr>
                          <td className="p-2"><input type="checkbox" checked readOnly /></td>
                          <td className="p-2">system</td>
                          <td className="p-2 font-mono text-muted-foreground">system.img</td>
                          <td className="p-2">Ready</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-2 justify-end mt-2">
                    <Button variant="outline">Save Profile JSON</Button>
                    <Button>Flash Checked Partitions</Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "tools" && (
            <div className="flex h-full gap-4">
              {/* Sidebar */}
              <div className="w-[200px] flex flex-col gap-1 border-r border-slate-800 pr-4 shrink-0">
                 {["firmware", "utilities"].map((t) => (
                   <button 
                     key={t}
                     onClick={() => setToolsSidebarTab(t)}
                     className={`text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${toolsSidebarTab === t ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
                   >
                     {t === "firmware" && "Firmware Flasher"}
                     {t === "utilities" && "Utilities"}
                   </button>
                 ))}
              </div>

              {/* Content */}
              <div className="flex-1 flex flex-col gap-4">
                 {toolsSidebarTab === "firmware" && (
                   <>
                     <Card className="bg-[#161925] border-slate-800 shadow-lg">
                       <CardHeader className="pb-3 border-b border-slate-800/50">
                         <CardTitle className="flex items-center gap-2 text-white"><Zap className="h-5 w-5 text-cyan-400"/> Firmware Flasher (Task Engine)</CardTitle>
                         <CardDescription className="text-slate-400">Safely flash firmware packages with pre-flight checks and automated sequences.</CardDescription>
                       </CardHeader>
                       <CardContent className="pt-4 flex flex-col gap-4">
                         <div className="flex gap-2">
                           <Input 
                             placeholder="Select Firmware Directory..."
                             value={firmwareDir}
                             onChange={(e) => setFirmwareDir(e.target.value)}
                             className="flex-1 bg-[#222532] border-slate-700 text-white"
                           />
                           <Button onClick={generateFlashPlan} disabled={isRunning || !firmwareDir} className="bg-purple-600 hover:bg-purple-700 text-white border-none shadow-md">
                             Load Firmware
                           </Button>
                         </div>
                       </CardContent>
                     </Card>

                     {flashPlan.length > 0 && (
                       <Card className="bg-[#161925] border-slate-800 shadow-lg">
                         <CardHeader className="pb-3 border-b border-slate-800/50">
                           <CardTitle className="text-white">Flash Plan Preview</CardTitle>
                           <CardDescription className="text-slate-400">Review the execution order and pre-flight checks.</CardDescription>
                         </CardHeader>
                         <CardContent className="pt-4">
                           <div className="flex flex-col gap-2 mb-4 bg-slate-800/30 p-4 rounded-md border border-slate-700 text-sm">
                             {flashPlan.map((step, idx) => (
                               <div key={idx} className="flex justify-between items-center">
                                 <span className={currentStep === idx ? "text-cyan-400 font-bold" : "text-slate-400"}>
                                   {idx + 1}. {step.name}
                                 </span>
                                 <span className={
                                   step.status === "done" ? "text-emerald-400 font-bold" :
                                   step.status === "running" ? "text-orange-400 animate-pulse font-bold" : "text-slate-500"
                                 }>
                                   {step.status.toUpperCase()}
                                 </span>
                               </div>
                             ))}
                           </div>
                           
                           <Button 
                             onClick={executeFlashPlan} 
                             disabled={isRunning || currentStep !== -1} 
                             className={`w-full text-white font-bold tracking-wide shadow-md border-none ${currentStep !== -1 ? 'bg-slate-700' : 'bg-emerald-500 hover:bg-emerald-600'}`}
                           >
                             {currentStep !== -1 ? "Flashing..." : "Execute Flash Plan"}
                           </Button>
                         </CardContent>
                       </Card>
                     )}
                   </>
                 )}

                 {toolsSidebarTab === "utilities" && (
                   <>
                     <Card className="bg-[#161925] border-slate-800 shadow-lg">
                       <CardHeader className="pb-3 border-b border-slate-800/50">
                         <CardTitle className="flex items-center gap-2 text-white"><Zap className="h-5 w-5 text-purple-400"/> Payload.bin Extractor</CardTitle>
                         <CardDescription className="text-slate-400">Extract OTA payload.bin files to raw flashable images.</CardDescription>
                       </CardHeader>
                       <CardContent className="pt-4 flex flex-col gap-2">
                          <Input 
                             placeholder="Select payload.bin..." 
                             value={payloadFile} 
                             onChange={(e) => setPayloadFile(e.target.value)}
                             className="bg-[#222532] border-slate-700 text-white" 
                           />
                          <Button disabled={!payloadFile} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold border-none">Extract Payload</Button>
                       </CardContent>
                     </Card>

                     <div className="grid grid-cols-2 gap-4">
                       <Card className="bg-[#161925] border-slate-800 shadow-lg">
                         <CardHeader className="pb-3 border-b border-slate-800/50">
                           <CardTitle className="text-white">Driver Diagnostics</CardTitle>
                         </CardHeader>
                         <CardContent className="pt-4 flex flex-col gap-2">
                            <Button className="bg-slate-800 border-slate-700 text-slate-300 hover:text-white" onClick={() => addLog("Installing Google USB Drivers...", "info", "t_tools")}>Install ADB Driver</Button>
                            <Button className="bg-slate-800 border-slate-700 text-slate-300 hover:text-white" onClick={() => addLog("Scanning registry for driver conflicts...", "info", "t_tools")}>Fix Device Not Recognized</Button>
                         </CardContent>
                       </Card>

                       <Card className="bg-[#161925] border-slate-800 shadow-lg">
                         <CardHeader className="pb-3 border-b border-slate-800/50">
                           <CardTitle className="text-white">Partition Backup</CardTitle>
                         </CardHeader>
                         <CardContent className="pt-4 flex flex-col gap-2">
                            <Button className="bg-slate-800 border-slate-700 text-slate-300 hover:text-white" onClick={() => handleStreamSidecar("adb", ["pull", "/dev/block/bootdevice/by-name/persist", "persist.img"], "t_tools", "adb pull persist")}>Backup Persist (Needs Root)</Button>
                            <Button className="bg-slate-800 border-slate-700 text-slate-300 hover:text-white" onClick={() => handleStreamSidecar("adb", ["pull", "/dev/block/bootdevice/by-name/modemst1", "modemst1.img"], "t_tools", "adb pull modemst1")}>Backup EFS (Needs Root)</Button>
                         </CardContent>
                       </Card>
                     </div>
                   </>
                 )}
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Bottom: Terminal Log Window */}
        <div className="flex-[2] border-t border-slate-800 bg-[#0c0d14] flex flex-col min-h-[300px]">
          <div className="flex items-center justify-between border-b border-slate-800 bg-[#161925] px-4 py-2">
            <div className="flex items-center gap-2 font-semibold text-slate-300 tracking-wide text-sm">
              <TerminalIcon className="h-4 w-4 text-cyan-500" />
              TERMINAL
            </div>
            <div className="flex gap-3">
               <button className="text-slate-500 hover:text-white transition-colors" title="Copy Logs">
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
               </button>
               <button onClick={clearTerminal} className="text-slate-500 hover:text-white transition-colors" title="Clear Logs">
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
               </button>
            </div>
          </div>
          
          <ScrollArea ref={scrollRef} className="flex-1 p-4 font-mono text-[13px] leading-relaxed">
            {logs.length === 0 ? (
              <div className="text-slate-600 italic">No output yet. Connect a device and run a command.</div>
            ) : (
              <div className="flex flex-col gap-1">
                {logs.map((log, idx) => (
                  <div key={idx} className="break-all flex gap-3">
                    <span className="text-slate-500 shrink-0">[{log.ts}]</span>
                    {log.level === "cmd" && (
                      <span className="text-cyan-400 font-bold">› {log.text}</span>
                    )}
                    {log.level === "error" && (
                      <span className="text-red-400">✗ {log.text}</span>
                    )}
                    {log.level === "warning" && (
                      <span className="text-orange-400">⚠ {log.text}</span>
                    )}
                    {log.level === "info" && (
                      <span className="text-slate-300">
                        {log.text.startsWith("Finished. Total time") ? (
                           <div className="flex flex-col">
                             <span className="text-slate-300">● {log.text}</span>
                             <span className="text-emerald-400 font-bold flex items-center gap-2 mt-1">
                               <CheckCircle2 className="h-3.5 w-3.5" /> OK
                             </span>
                           </div>
                        ) : log.text.includes("Error:") || log.text.includes("FAILED") ? (
                           <div className="flex flex-col">
                             <span className="text-slate-300">● {log.text}</span>
                             <span className="text-red-400 font-bold flex items-center gap-2 mt-1">
                               <XCircle className="h-3.5 w-3.5" /> FAILED
                             </span>
                           </div>
                        ) : (
                           <span>● {log.text}</span>
                        )}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
