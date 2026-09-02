import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PhoneCall, MessageCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createThreadWithMessage,
  fetchTeamMembers,
  logCall,
  WHATSAPP_TEMPLATES,
} from "@/lib/comms-queries";
import { cn } from "@/lib/utils";

type Mode = "call" | "whatsapp" | "email" | null;

const selectClass =
  "h-10 w-full rounded-md bg-panel2 border border-line px-3 text-sm text-foreground";

export function QuickActionsBar({
  agentName,
  defaultContactName = "",
  defaultPhone = "",
  defaultEmail = "",
  className,
}: {
  agentName: string;
  defaultContactName?: string;
  defaultPhone?: string;
  defaultEmail?: string;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>(null);
  const { data: team = [] } = useQuery({ queryKey: ["team-members"], queryFn: fetchTeamMembers });

  const [contactName, setContactName] = useState(defaultContactName);
  const [handle, setHandle] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [agentId, setAgentId] = useState("");
  const [callType, setCallType] = useState<"Incoming" | "Outgoing" | "Missed">("Outgoing");
  const [duration, setDuration] = useState("0");

  function open(next: Exclude<Mode, null>) {
    setContactName(defaultContactName);
    setHandle(next === "email" ? defaultEmail : defaultPhone);
    setSubject("");
    setBody(next === "whatsapp" ? (WHATSAPP_TEMPLATES[0]?.body ?? "") : "");
    setAgentId("");
    setCallType("Outgoing");
    setDuration("0");
    setMode(next);
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (mode === "call") {
        if (!handle.trim()) throw new Error("Caller number is required");
        return logCall({
          caller_name: contactName.trim() || "Unknown caller",
          caller_number: handle.trim(),
          call_type: callType,
          duration_seconds: Number(duration) || 0,
          notes: body.trim() || null,
          agent_id: agentId || null,
        });
      }
      if (!handle.trim() || !body.trim()) throw new Error("Recipient and message are required");
      return createThreadWithMessage({
        channel_type: mode === "email" ? "email" : "whatsapp",
        contact_name: contactName.trim() || handle.trim(),
        contact_handle: handle.trim(),
        subject: mode === "email" ? subject.trim() || "(no subject)" : null,
        assigned_to: agentId || null,
        content: body.trim(),
        senderName: agentName,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comm-threads"] });
      queryClient.invalidateQueries({ queryKey: ["call-logs"] });
      toast.success(
        mode === "call" ? "Call logged" : mode === "email" ? "Email queued" : "WhatsApp queued",
      );
      setMode(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className={cn("flex flex-wrap gap-2", className)}>
        <Button variant="outline" size="sm" onClick={() => open("call")}>
          <PhoneCall className="size-4" /> Log a Call
        </Button>
        <Button variant="outline" size="sm" onClick={() => open("whatsapp")}>
          <MessageCircle className="size-4" /> Send WhatsApp Template
        </Button>
        <Button variant="outline" size="sm" onClick={() => open("email")}>
          <Mail className="size-4" /> Compose Email
        </Button>
      </div>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="bg-panel border-line sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="display-title text-xl">
              {mode === "call"
                ? "Log a call"
                : mode === "email"
                  ? "Compose email"
                  : "Send WhatsApp template"}
            </DialogTitle>
            <DialogDescription>
              Creates a thread in the omnichannel inbox and assigns it to a rep.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact name</Label>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{mode === "email" ? "Email address" : "Phone number"}</Label>
                <Input value={handle} onChange={(e) => setHandle(e.target.value)} />
              </div>
            </div>

            {mode === "call" && (
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Call type</Label>
                  <select
                    className={selectClass}
                    value={callType}
                    onChange={(e) => setCallType(e.target.value as typeof callType)}
                  >
                    <option value="Incoming">Incoming</option>
                    <option value="Outgoing">Outgoing</option>
                    <option value="Missed">Missed</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Duration (seconds)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </div>
              </div>
            )}

            {mode === "email" && (
              <div className="space-y-1.5">
                <Label>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            )}

            {mode === "whatsapp" && (
              <div className="space-y-1.5">
                <Label>Template</Label>
                <select
                  className={selectClass}
                  onChange={(e) => setBody(e.target.value)}
                  defaultValue={WHATSAPP_TEMPLATES[0]?.body}
                >
                  {WHATSAPP_TEMPLATES.map((t) => (
                    <option key={t.label} value={t.body}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{mode === "call" ? "Follow-up notes" : "Message"}</Label>
              <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Assign to</Label>
              <select
                className={selectClass}
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              >
                <option value="">Unassigned</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} · {m.role_title}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setMode(null)}>
                Cancel
              </Button>
              <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
                {submit.isPending ? "Saving…" : mode === "call" ? "Log call" : "Send"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
