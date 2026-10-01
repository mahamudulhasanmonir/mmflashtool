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
import { Terminal as TerminalIcon, Zap, Smartphone, Activity, Cpu } from "lucide-react";

interface TerminalEvent {
  taskId: string;
  ts: string;
  level: string;
  text: string;
  elapsedMs: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"adb" | "fastboot" | "flash" | "unlock" | "program" | "tools" | "mtk" | "qcom" | "sam">("adb");
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

  // Phase 5 State
  const [unlockToken, setUnlockToken] = useState("");
  const [payloadFile, setPayloadFile] = useState("");
  const [scatterFile, setScatterFile] = useState("");

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

  return (
    <div className="flex h-screen flex-col bg-background p-4 text-foreground dark">
      {/* Header */}
      <header className="mb-4 flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">TechFlash</h1>
        </div>
        
        {/* Basic Tabs */}
        <div className="flex gap-2 flex-wrap">
          <Button variant={activeTab === "adb" ? "default" : "outline"} onClick={() => setActiveTab("adb")} size="sm">
            ADB
          </Button>
          <Button variant={activeTab === "fastboot" ? "default" : "outline"} onClick={() => setActiveTab("fastboot")} size="sm">
            Fastboot
          </Button>
          <Button variant={activeTab === "flash" ? "default" : "outline"} onClick={() => setActiveTab("flash")} size="sm">
            Firmware
          </Button>
          <Button variant={activeTab === "unlock" ? "default" : "outline"} onClick={() => setActiveTab("unlock")} size="sm">
            Unlock/Root
          </Button>
          <Button variant={activeTab === "program" ? "default" : "outline"} onClick={() => setActiveTab("program")} size="sm">
            Program
          </Button>
          <Button variant={activeTab === "tools" ? "default" : "outline"} onClick={() => setActiveTab("tools")} size="sm">
            Tools
          </Button>
          <div className="w-px h-6 bg-border mx-1 self-center"></div>
          <Button variant={activeTab === "mtk" ? "default" : "outline"} onClick={() => setActiveTab("mtk")} size="sm">
            MediaTek
          </Button>
          <Button variant={activeTab === "qcom" ? "default" : "outline"} onClick={() => setActiveTab("qcom")} size="sm">
            Qualcomm
          </Button>
          <Button variant={activeTab === "sam" ? "default" : "outline"} onClick={() => setActiveTab("sam")} size="sm">
            Samsung
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-success"></div>
          <span className="text-sm text-muted-foreground">Device Connected</span>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        
        {/* Left: Actions Panel */}
        <div className="flex flex-col gap-4 overflow-y-auto pr-2">
          
          {activeTab === "adb" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5"/> Device Info</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div><span className="text-muted-foreground">Model:</span> {deviceInfo.model}</div>
                    <div><span className="text-muted-foreground">Brand:</span> {deviceInfo.brand}</div>
                    <div><span className="text-muted-foreground">Android:</span> {deviceInfo.androidVersion}</div>
                    <div><span className="text-muted-foreground">Battery:</span> {deviceInfo.battery}</div>
                  </div>
                  <Button onClick={fetchDeviceInfo} disabled={isRunning} variant="secondary" className="w-full">
                    Refresh Device Info
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5"/> ADB Reboot Menu</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button onClick={() => handleAdbReboot("system")} disabled={isRunning} variant="outline">System</Button>
                  <Button onClick={() => handleAdbReboot("recovery")} disabled={isRunning} variant="outline">Recovery</Button>
                  <Button onClick={() => handleAdbReboot("bootloader")} disabled={isRunning} variant="outline">Bootloader</Button>
                  <Button onClick={() => handleAdbReboot("fastboot")} disabled={isRunning} variant="outline">Fastbootd</Button>
                  <Button onClick={() => handleAdbReboot("edl")} disabled={isRunning} variant="outline">EDL</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><TerminalIcon className="h-5 w-5"/> Shell Command</CardTitle>
                  <CardDescription>Run a raw ADB shell command.</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Input
                    value={shellCmd}
                    onChange={(e) => setShellCmd(e.target.value)}
                    placeholder="e.g. ls -la /sdcard"
                    className="flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleAdbShell()}
                  />
                  <Button onClick={handleAdbShell} disabled={isRunning || !shellCmd}>Run</Button>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "fastboot" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5"/> Fastboot Dashboard</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex gap-2">
                    <Button onClick={() => handleExecuteSidecar("fastboot", ["devices"], "t_fb_check", "devices")} disabled={isRunning} variant="default" className="flex-1">Check Device</Button>
                    <select className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none" onChange={(e) => handleStreamSidecar("fastboot", ["reboot", e.target.value], "t_fb_reboot", `reboot ${e.target.value}`)}>
                      <option value="">Reboot to...</option>
                      <option value="">System</option>
                      <option value="recovery">Recovery</option>
                      <option value="bootloader">Bootloader</option>
                      <option value="fastboot">Fastbootd</option>
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    <Button onClick={() => handleStreamSidecar("fastboot", ["getvar", "all"], "t_fb_getvar", "getvar all")} disabled={isRunning} variant="outline" size="sm">Get All</Button>
                    <Button onClick={() => handleStreamSidecar("fastboot", ["getvar", "current-slot"], "t_fb_getvar", "getvar current-slot")} disabled={isRunning} variant="outline" size="sm">Slot</Button>
                    <Button onClick={() => handleStreamSidecar("fastboot", ["getvar", "product"], "t_fb_getvar", "getvar product")} disabled={isRunning} variant="outline" size="sm">Product</Button>
                    <Button onClick={() => handleStreamSidecar("fastboot", ["getvar", "unlocked"], "t_fb_getvar", "getvar unlocked")} disabled={isRunning} variant="outline" size="sm">Status</Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2">
                  <Button onClick={() => handleStreamSidecar("fastboot", ["flashing", "unlock"], "t_fb_unlock", "flashing unlock")} disabled={isRunning} variant="destructive">Flashing Unlock</Button>
                  <Button onClick={() => handleStreamSidecar("fastboot", ["flashing", "lock"], "t_fb_lock", "flashing lock")} disabled={isRunning} variant="secondary">Flashing Lock</Button>
                  <Button onClick={() => handleStreamSidecar("fastboot", ["set_active", "other"], "t_fb_slot", "set_active other")} disabled={isRunning} variant="outline">Change Slot (A↔B)</Button>
                  <Button onClick={() => handleStreamSidecar("fastboot", ["-w"], "t_fb_wipe", "-w")} disabled={isRunning} variant="destructive">Format Data (-w)</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Flash Partition</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex gap-2 items-center">
                    <select
                      value={flashPartition}
                      onChange={(e) => setFlashPartition(e.target.value)}
                      className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none"
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
                    
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="disable-verity" checked={disableVerity} onChange={(e) => setDisableVerity(e.target.checked)} />
                      <label htmlFor="disable-verity" className="text-sm">Disable Verity</label>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Select image file..."
                      value={flashFile}
                      onChange={(e) => setFlashFile(e.target.value)}
                      className="flex-1"
                    />
                    <Button onClick={handleFlash} disabled={isRunning || !flashFile}>
                      Flash Image
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Raw Fastboot Command</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Input
                    value={fbShellCmd}
                    onChange={(e) => setFbShellCmd(e.target.value)}
                    placeholder="e.g. erase boot"
                    className="flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleFbShell()}
                  />
                  <Button onClick={handleFbShell} disabled={isRunning || !fbShellCmd}>Run</Button>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "flash" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5"/> Firmware Flasher (Task Engine)</CardTitle>
                  <CardDescription>
                    Safely flash firmware packages with pre-flight checks and automated sequences.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Select Firmware Directory..."
                      value={firmwareDir}
                      onChange={(e) => setFirmwareDir(e.target.value)}
                      className="flex-1"
                    />
                    <Button onClick={generateFlashPlan} disabled={isRunning || !firmwareDir} variant="secondary">
                      Load Firmware
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {flashPlan.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Flash Plan Preview</CardTitle>
                    <CardDescription>Review the execution order and pre-flight checks.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-2 mb-4 bg-muted/50 p-4 rounded-md border text-sm">
                      {flashPlan.map((step, idx) => (
                        <div key={idx} className="flex justify-between items-center">
                          <span className={currentStep === idx ? "text-primary font-bold" : "text-muted-foreground"}>
                            {idx + 1}. {step.name}
                          </span>
                          <span className={
                            step.status === "done" ? "text-success font-bold" :
                            step.status === "running" ? "text-warning animate-pulse" : "text-muted-foreground"
                          }>
                            {step.status.toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    <Button 
                      onClick={executeFlashPlan} 
                      disabled={isRunning || currentStep !== -1} 
                      className="w-full" 
                      variant={currentStep !== -1 ? "secondary" : "default"}
                    >
                      {currentStep !== -1 ? "Flashing..." : "Execute Flash Plan"}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {activeTab === "unlock" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5"/> Bootloader Unlock Wizard</CardTitle>
                  <CardDescription className="text-warning font-bold">WARNING: Unlocking will wipe all user data!</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-muted px-2 py-1 rounded text-sm w-6 text-center">1</span>
                    <span className="text-sm">Enable Developer Options and "OEM Unlocking" in Android Settings.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-muted px-2 py-1 rounded text-sm w-6 text-center">2</span>
                    <Button variant="outline" size="sm" onClick={() => handleExecuteSidecar("adb", ["reboot", "bootloader"], "t_ul_reboot", "adb reboot bootloader")}>Reboot to Bootloader</Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-muted px-2 py-1 rounded text-sm w-6 text-center">3</span>
                    <Button variant="destructive" size="sm" onClick={() => handleStreamSidecar("fastboot", ["flashing", "unlock"], "t_ul_unlock", "fastboot flashing unlock")}>Execute Flashing Unlock</Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Token-Based Unlock (Vendor Specific)</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Input 
                    placeholder="Enter unlock token file or code..." 
                    value={unlockToken} 
                    onChange={(e) => setUnlockToken(e.target.value)} 
                    className="flex-1" 
                  />
                  <Button disabled={!unlockToken} onClick={() => handleStreamSidecar("fastboot", ["flash", "unlock", unlockToken], "t_ul_token", `fastboot flash unlock ${unlockToken}`)}>Flash Token</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Custom Recovery / Magisk Patcher</CardTitle>
                  <CardDescription>Quick flash for patched boot or custom recovery images.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                   <div className="flex gap-2">
                     <Button className="flex-1" variant="secondary" onClick={() => addLog("Please use the file picker (coming soon) to select your recovery.img.", "info", "t_ul_helper")}>Select recovery.img</Button>
                     <Button disabled>Flash Recovery</Button>
                   </div>
                   <div className="flex gap-2">
                     <Button className="flex-1" variant="secondary" onClick={() => addLog("Please use the file picker (coming soon) to select your magisk_patched.img.", "info", "t_ul_helper")}>Select magisk_boot.img</Button>
                     <Button disabled>Flash Boot</Button>
                   </div>
                </CardContent>
              </Card>
            </>
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
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5"/> Payload.bin Extractor</CardTitle>
                  <CardDescription>Extract OTA payload.bin files to raw flashable images.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                   <Input 
                      placeholder="Select payload.bin..." 
                      value={payloadFile} 
                      onChange={(e) => setPayloadFile(e.target.value)} 
                    />
                   <Button disabled={!payloadFile} className="w-full">Extract Payload</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Driver Diagnostics</CardTitle>
                  <CardDescription>Install and fix ADB / Fastboot / VCOM USB drivers.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2">
                   <Button variant="secondary" onClick={() => addLog("Installing Google USB Drivers...", "info", "t_tools")}>Install Universal ADB Driver</Button>
                   <Button variant="secondary" onClick={() => addLog("Scanning registry for driver conflicts...", "info", "t_tools")}>Fix Device Not Recognized</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Partition Backup</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2">
                   <Button variant="outline" onClick={() => handleStreamSidecar("adb", ["pull", "/dev/block/bootdevice/by-name/persist", "persist.img"], "t_tools", "adb pull persist")}>Backup Persist (Needs Root)</Button>
                   <Button variant="outline" onClick={() => handleStreamSidecar("adb", ["pull", "/dev/block/bootdevice/by-name/modemst1", "modemst1.img"], "t_tools", "adb pull modemst1")}>Backup EFS (Needs Root)</Button>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "mtk" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Cpu className="h-5 w-5"/> MediaTek (BROM / Preloader)</CardTitle>
                  <CardDescription>Bypass SLA/DA and flash scatter firmware directly to MTK devices.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex gap-2">
                    <Button variant="default" onClick={() => addLog("Waiting for MTK device in BROM mode (Hold Vol+ and Vol- while inserting USB)...", "cmd", "t_mtk")} className="flex-1">Auth Bypass (SLA/DA)</Button>
                    <Button variant="outline" onClick={() => addLog("Scanning for MTK Preloader VCOM port...", "info", "t_mtk")} className="flex-1">Read Partitions</Button>
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="Select Scatter File (MTxxxx_Android_scatter.txt)..." />
                    <Button variant="secondary">Load Scatter</Button>
                  </div>
                  <Button variant="destructive">Flash Firmware</Button>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "qcom" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Cpu className="h-5 w-5"/> Qualcomm (EDL / Firehose)</CardTitle>
                  <CardDescription>Flash QFIL firmware using rawprogram and patch XMLs via 9008 mode.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => addLog("Waiting for Qualcomm HS-USB QDLoader 9008...", "cmd", "t_qcom")}>Ping EDL (9008)</Button>
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="Select Programmer (prog_firehose_ddr.elf)..." />
                    <Button variant="secondary">Load Programmer</Button>
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="Select rawprogram0.xml..." />
                    <Input placeholder="Select patch0.xml..." />
                  </div>
                  <Button variant="destructive">Flash XML Firmware</Button>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "sam" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Cpu className="h-5 w-5"/> Samsung (Download Mode)</CardTitle>
                  <CardDescription>Odin/Heimdall style flashing for Samsung devices in Download Mode.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => addLog("Detecting device in Download Mode...", "cmd", "t_sam")} className="w-full">Detect Device</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="BL (Bootloader)..." />
                    <Input placeholder="AP (System)..." />
                    <Input placeholder="CP (Modem)..." />
                    <Input placeholder="CSC (Carrier)..." />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                     <input type="checkbox" id="auto-reboot" defaultChecked />
                     <label htmlFor="auto-reboot" className="text-sm">Auto Reboot</label>
                     <input type="checkbox" id="nand-erase" />
                     <label htmlFor="nand-erase" className="text-sm">NAND Erase All</label>
                  </div>
                  <Button variant="destructive">Start Flash</Button>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Right: Terminal */}
        <Card className="flex h-full flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-2">
              <TerminalIcon className="h-5 w-5" />
              <CardTitle className="text-md">Terminal Log</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={clearTerminal}>
              Clear
            </Button>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-2 pt-0 h-full">
            <ScrollArea
              className="h-full w-full rounded-md bg-black/50 p-4 font-mono text-sm"
              ref={scrollRef}
            >
              {logs.length === 0 ? (
                <div className="text-muted-foreground italic">
                  Waiting for commands...
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="mb-1 leading-tight break-all">
                    <span className="text-muted-foreground mr-2">[{log.ts}]</span>
                    <span
                      className={
                        log.level === "error"
                          ? "text-destructive"
                          : log.level === "cmd"
                          ? "text-info"
                          : "text-foreground"
                      }
                    >
                      {log.text}
                    </span>
                  </div>
                ))
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
