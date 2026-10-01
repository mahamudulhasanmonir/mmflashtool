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
import { Terminal as TerminalIcon, Zap } from "lucide-react";

interface TerminalEvent {
  taskId: string;
  ts: string;
  level: string;
  text: string;
  elapsedMs: number;
}

export default function App() {
  const [logs, setLogs] = useState<TerminalEvent[]>([]);
  const [varName, setVarName] = useState("all");
  const [isRunning, setIsRunning] = useState(false);
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

  const handleGetVar = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setLogs((prev) => [
      ...prev,
      {
        taskId: "t_getvar",
        ts: new Date().toLocaleTimeString('en-US', { hour12: false }),
        level: "cmd",
        text: `> fastboot getvar ${varName}`,
        elapsedMs: 0,
      },
    ]);
    try {
      await invoke("fastboot_getvar", { var: varName });
    } catch (e: any) {
      setLogs((prev) => [
        ...prev,
        {
          taskId: "error",
          ts: new Date().toLocaleTimeString('en-US', { hour12: false }),
          level: "error",
          text: `Error: ${e}`,
          elapsedMs: 0,
        },
      ]);
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
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-success"></div>
          <span className="text-sm text-muted-foreground">Device Connected</span>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: Actions Panel */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Fastboot Actions</CardTitle>
              <CardDescription>
                Execute standard fastboot commands.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  value={varName}
                  onChange={(e) => setVarName(e.target.value)}
                  placeholder="Variable name (e.g., all, product)"
                  className="max-w-[200px]"
                />
                <Button onClick={handleGetVar} disabled={isRunning}>
                  Getvar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Terminal */}
        <Card className="flex h-full flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-2">
              <TerminalIcon className="h-5 w-5" />
              <CardTitle className="text-md">Terminal</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={clearTerminal}>
              Clear
            </Button>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-2 pt-0">
            <ScrollArea
              className="h-full w-full rounded-md bg-black/50 p-4 font-mono text-sm"
              ref={scrollRef}
            >
              {logs.length === 0 ? (
                <div className="text-muted-foreground italic">
                  Waiting for events...
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
