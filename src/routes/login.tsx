import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Receipt, ShieldCheck, Zap, Phone, Eye, EyeOff, Layers } from "lucide-react";
import { login, getUser } from "@/lib/auth";
import { loginSuperAdmin } from "@/lib/tenant";
import { actions } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && getUser()) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Sign in · RSP Billing Software" },
      { name: "description", content: "Secure staff login for RSP Billing Software." },
      { property: "og:title", content: "Sign in · RSP Billing Software" },
      { property: "og:description", content: "Secure staff login for RSP Billing Software." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (loginSuperAdmin(phone, password)) {
        setLoading(false);
        toast.success("Super admin console");
        navigate({ to: "/superadmin" });
        return;
      }
      const u = await login(phone, password, remember);
      setLoading(false);
      if (u) {
        actions.logLogin({ id: u.id, name: u.name });
        toast.success(`Welcome, ${u.name} · ${u.role}`);
        navigate({ to: "/" });
      } else {
        toast.error("Invalid phone number or password");
      }
    } catch {
      setLoading(false);
      toast.error("Invalid phone number or password");
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex relative overflow-hidden bg-gradient-to-br from-[color:var(--info)] via-[color:var(--info)] to-primary text-white p-12 flex-col justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-white/15 backdrop-blur grid place-items-center">
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-semibold">RSP Billing Software</div>
            <div className="text-xs text-white/70">Billing · Inventory · Reports</div>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -top-16 -left-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute top-32 right-0 h-56 w-56 rounded-full bg-[color:var(--warning)]/40 blur-3xl" />
          <div className="relative">
            <h1 className="text-4xl xl:text-5xl font-semibold leading-tight tracking-tight">
              One billing system. Any business.
            </h1>
            <p className="mt-4 text-white/80 max-w-md">
              Every staff member logs in with their phone number, and each bill is tied to their
              Employee ID.
            </p>
            <div className="mt-10 grid grid-cols-3 gap-3 max-w-md">
              {[
                { icon: Zap, label: "Bill in 20s" },
                { icon: Layers, label: "Live stock" },
                { icon: ShieldCheck, label: "Audit trail" },
              ].map((f) => (
                <div key={f.label} className="rounded-xl bg-white/10 backdrop-blur p-4">
                  <f.icon className="h-5 w-5 mb-2" />
                  <div className="text-sm font-medium">{f.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="text-xs text-white/60">Version 2.0 · © 2026 RSP Software</div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Receipt className="h-5 w-5" />
            </div>
            <div className="font-semibold">RSP Billing Software</div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">Sign in to continue</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Use the phone number and password given by your admin.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone (User ID)</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  className="pl-9"
                  inputMode="tel"
                  autoComplete="username"
                  placeholder="10-digit phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  className="pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                Remember me
              </label>
              <button type="button" className="text-[color:var(--info)] hover:underline"
                onClick={() => toast("Ask your business admin to reset your password.")}>
                Forgot password?
              </button>
            </div>

            <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
              {loading ? "Signing in…" : "Login"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">Version 2.0</p>
        </div>
      </div>
    </div>
  );
}
