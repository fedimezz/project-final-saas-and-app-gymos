"use client";

import { useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const FALLBACK_DESTINATION = "/dashboard";

function sanitizeNext(next: string | null): string {
    if (!next || !next.startsWith("/") || next.startsWith("//")) {
        return FALLBACK_DESTINATION;
    }
    return next;
}

function SyncInner() {
    const searchParams = useSearchParams();
    const { login } = useAuth();
    const ranRef = useRef(false);

    useEffect(() => {
        if (ranRef.current) return;
        ranRef.current = true;

        const destination = sanitizeNext(searchParams.get("next"));

        (async () => {
            try {
                const res = await fetch("/api/auth/session", { credentials: "include" });
                if (!res.ok) {
                    window.location.href = "/user/login";
                    return;
                }
                const data = await res.json();
                if (!data.user) {
                    window.location.href = "/user/login";
                    return;
                }
                login(data.user.role, data.user);
                window.location.href = destination;
            } catch {
                window.location.href = "/user/login?error=google_error";
            }
        })();
    }, [searchParams, login]);

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-neutral-500">
                <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm">Connexion en cours…</p>
            </div>
        </div>
    );
}

export default function GoogleSyncPage() {
    return (
        <Suspense fallback={null}>
            <SyncInner />
        </Suspense>
    );
}