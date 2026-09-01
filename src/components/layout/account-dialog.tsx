"use client";

import * as React from "react";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function AccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { signIn, signUp } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");

  async function handleSubmit(mode: "signin" | "signup") {
    setError("");
    setPending(true);
    if (mode === "signup") {
      trackEvent("signup_started", { source: "account_dialog" });
    }
    const result = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setPending(false);
    if (result.ok) {
      if (mode === "signup") {
        trackEvent("signup_completed", { source: "account_dialog" });
      }
      const pendingDraft = window.sessionStorage.getItem("triptrace-pending-draft");
      if (pendingDraft) {
        toast.success("Signed in. Your draft is ready for private save.");
      } else {
        toast.success(mode === "signin" ? t("auth.signin") : t("auth.signup"));
      }
      onOpenChange(false);
      setEmail("");
      setPassword("");
    } else {
      setError(result.error?.message || "Request failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("auth.accountTitle")}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="signin">
          <TabsList className="w-full">
            <TabsTrigger value="signin" className="flex-1">
              {t("auth.signin")}
            </TabsTrigger>
            <TabsTrigger value="signup" className="flex-1">
              {t("auth.signup")}
            </TabsTrigger>
          </TabsList>
          {(["signin", "signup"] as const).map((mode) => (
            <TabsContent key={mode} value={mode} className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${mode}-email`}>{t("auth.emailLabel")}</Label>
                <Input
                  id={`${mode}-email`}
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${mode}-password`}>{t("auth.passwordLabel")}</Label>
                <Input
                  id={`${mode}-password`}
                  type="password"
                  placeholder={t("auth.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button className="w-full" disabled={pending} onClick={() => handleSubmit(mode)}>
                {pending ? "…" : t(`auth.${mode}`)}
              </Button>
            </TabsContent>
          ))}
        </Tabs>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
