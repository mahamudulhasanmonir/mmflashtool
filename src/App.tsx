import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
  const [disableVerity, setDisableVerity] = useState(false);
  const [flashFile, setFlashFile] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  
  // Phase 4 State
  const [firmwareDir, setFirmwareDir] = useState("");
  const [flashPlan, setFlashPlan] = useState<{name: string, status: string}[]>([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [unlockSidebarTab, setUnlockSidebarTab] = useState("general");
  const [toolsSidebarTab, setToolsSidebarTab] = useState("firmware");

  // Phase 5 State
  const [unlockToken, setUnlockToken] = useState("");
  const [payloadFile, setPayloadFile] = useState("");
  const [scatterFile, setScatterFile] = useState("");

  // Phase 7 State
  const [licenseKey, setLicenseKey] = useState("");
  const [isLicensed, setIsLicensed] = useState(false);
  const [optInTelemetry, setOptInTelemetry] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Device Info State
  const [deviceInfo, setDeviceInfo] = useState({
    model: "Unknown",
    brand: "Unknown",
    androidVersion: "Unknown",
    battery: "Unknown",
  });

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
    const args = ["flash", flashPartition];
    if (disableVerity) {
      args.push("--disable-verity", "--disable-verification");
    }
    args.push(flashFile);
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

      setDeviceInfo({
        model: getPropVal("ro.product.model"),
        brand: getPropVal("ro.product.brand"),
        androidVersion: getPropVal("ro.build.version.release"),
        battery: "Fetching...", 
      });
      
      // Get battery level
      const dumpsys = await invoke<string>("execute_sidecar", { sidecar: "adb", args: ["shell", "dumpsys", "battery"] });
      const batteryMatch = dumpsys.match(/level: (\d+)/);
      setDeviceInfo(prev => ({
        ...prev,
        battery: batteryMatch ? `${batteryMatch[1]}%` : "Unknown"
      }));

      addLog(`Device Info Updated: ${getPropVal("ro.product.model")}`, "info", "t_adb_info");
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
        <div className="flex-[3] overflow-y-auto p-4 bg-[#0f111a]">
          <div className="max-w-6xl mx-auto flex flex-col gap-4">
          
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
                <CardContent className="pt-6 flex flex-col gap-6">
                  
                  {/* Reboot Row */}
                  <div className="flex items-center gap-4">
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
                  <div className="flex items-center gap-4">
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
                  <div className="flex items-center gap-4">
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
                  <div className="flex items-center gap-4">
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
                  <div className="flex gap-2 mt-4 items-center">
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
                <CardContent className="pt-6 flex flex-col gap-6">
                  
                  {/* Reboot Row */}
                  <div className="flex items-center gap-4">
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
                  <div className="flex items-center gap-4">
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
                  <div className="flex items-center gap-4">
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
                  <div className="flex items-center gap-4">
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
                  <div className="flex gap-2 mt-4 items-center">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-4">
                <Card className="bg-[#161925] border-slate-800 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Zap className="h-32 w-32 text-cyan-400" />
                  </div>
                  <CardHeader>
                    <CardTitle className="text-2xl font-bold text-white tracking-wide">TECH<span className="text-cyan-400">FLASH</span></CardTitle>
                    <CardDescription className="text-slate-400">Advanced Firmware Flashing Utility</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3 text-sm">
                      <UserCircle className="h-5 w-5 text-purple-400" />
                      <span className="text-slate-300">Author: Mahamudul Hasan Monir</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <svg className="h-5 w-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/></svg>
                      <span className="text-slate-300">@techflash_tool</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M22.675 0h-21.35C.597 0 0 .597 0 1.325v21.351C0 23.403.597 24 1.325 24h11.495v-9.294H9.691v-3.622h3.129V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.73 0 1.323-.597 1.323-1.325V1.325C24 .597 23.403 0 22.675 0z"/></svg>
                      <span className="text-slate-300">fb.com/techflashtool</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-[#161925] border-slate-800 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-white">What's New (Changelog)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[120px] bg-slate-800/30 p-4 rounded text-sm border border-slate-800">
                      <strong className="text-cyan-400">v1.0.3</strong>
                      <ul className="list-disc ml-5 mb-3 text-slate-400">
                        <li>Overhauled UI with Dark/Modern Design.</li>
                        <li>Nested Unlock and Tools sidebars.</li>
                        <li>Combined ADB & Fastboot workspace.</li>
                      </ul>
                      <strong className="text-slate-300">v1.0.2</strong>
                      <ul className="list-disc ml-5 mb-3 text-slate-500">
                        <li>Added Phase 7 Account, Licensing, and Telemetry features.</li>
                        <li>Added hardware-bound licensing verification.</li>
                      </ul>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-col gap-4">
                <Card className="bg-[#161925] border-slate-800 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white"><ShieldCheck className="h-5 w-5 text-emerald-400"/> Software License</CardTitle>
                    <CardDescription className="text-slate-400">Activate TechFlash Pro using your hardware-bound license key.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
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
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white"><DownloadCloud className="h-5 w-5 text-purple-400"/> Updates & Telemetry</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
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
                    
                    <div className="flex justify-between items-center mt-2">
                      <Button variant="secondary" className="bg-slate-800 border-slate-700 text-slate-300 hover:text-white" onClick={() => addLog("Checking for updates... TechFlash is up to date (v1.0.3).", "info", "t_updater")}>Check for Updates</Button>
                      <Button variant="secondary" className="bg-slate-800 border-slate-700 text-slate-300 hover:text-white" onClick={() => addLog("Syncing latest remote device-profile database... Done.", "info", "t_updater")}>Sync Device DB</Button>
                    </div>

                    <div className="border-t border-slate-800 pt-4 mt-2">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="telemetry" checked={optInTelemetry} onChange={(e) => setOptInTelemetry(e.target.checked)} className="accent-cyan-500" />
                        <label htmlFor="telemetry" className="text-xs text-slate-400 leading-tight">Allow anonymous crash reporting and telemetry (No device identifiers are collected).</label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
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
