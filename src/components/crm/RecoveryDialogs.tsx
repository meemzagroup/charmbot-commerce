import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { recoverLoginId, requestPasswordReset } from "@/lib/account-recovery.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ForgotPasswordDialog({
  open,
  onOpenChange,
  defaultEmail,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultEmail?: string;
}) {
  const send = useServerFn(requestPasswordReset);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await send({ data: { email, origin: window.location.origin } });
      setResult(res.message);
      if (!res.ok) toast.error(res.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the reset link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Forgot password?</DialogTitle>
          <DialogDescription>
            Enter your registered email. We will send a one-time link that expires shortly. Your
            existing password is never shown or emailed.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{result}</p>
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fp_email">Registered email</Label>
              <Input
                id="fp_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ForgotLoginIdDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const recover = useServerFn(recoverLoginId);
  const [companyCode, setCompanyCode] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await recover({ data: { companyCode, employeeId, mobile } });
      setMessage(res.message);
      setMasked(res.maskedEmail ?? null);
      if (!res.ok) toast.error(res.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not verify those details");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Forgot login ID?</DialogTitle>
          <DialogDescription>
            Enter at least two details your administrator registered for you. We only show a partly
            hidden version of your login ID.
          </DialogDescription>
        </DialogHeader>

        {masked ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{message}</p>
            <div className="rounded-md border border-line bg-panel2 px-3 py-3 text-center font-mono text-sm">
              {masked}
            </div>
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fl_company">Company code</Label>
              <Input
                id="fl_company"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value)}
                placeholder="e.g. MEEMZA"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fl_emp">Employee ID</Label>
              <Input
                id="fl_emp"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="e.g. EMP-014"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fl_mobile">Registered mobile number</Label>
              <Input
                id="fl_mobile"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="e.g. +92 300 1234567"
              />
            </div>
            {message && <p className="text-sm text-destructive">{message}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Checking…" : "Recover login ID"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Still stuck? Ask your company administrator to look up your login ID for you.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
