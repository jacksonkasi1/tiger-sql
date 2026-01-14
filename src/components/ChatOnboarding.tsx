'use client';

// ** import core packages
import { useState, useEffect, type ReactNode } from 'react';

// ** import utils
import { cn } from '@/lib/utils';

// ** import ui components
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'chat-onboarding-seen';

const ONBOARDING_MESSAGE = "This is where ideas turn into actions.";

interface ChatOnboardingProps {
    children: ReactNode;
}

export function ChatOnboarding({ children }: ChatOnboardingProps) {
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);

    useEffect(() => {
        // Check localStorage on mount
        const hasSeenOnboarding = localStorage.getItem(STORAGE_KEY);
        if (!hasSeenOnboarding) {
            setShowOnboarding(true);
        }
    }, []);

    const handleDismiss = () => {
        setShowOnboarding(false);
        setShowTooltip(true);
        localStorage.setItem(STORAGE_KEY, 'true');
    };

    const handleTooltipClose = () => {
        setShowTooltip(false);
    };

    if (!showOnboarding && !showTooltip) {
        return <>{children}</>;
    }

    return (
        <div className="relative">
            {/* Neon Glow Container - uses a rotating gradient */}
            {showOnboarding && (
                <div
                    className={cn(
                        'absolute -inset-[3px] rounded-xl z-0 overflow-hidden',
                    )}
                >
                    {/* Rotating gradient layer */}
                    <div
                        className={cn(
                            'absolute inset-[-50%] animate-neon-spin',
                            'bg-[conic-gradient(from_0deg,#22d3ee,#a855f7,#ec4899,#22d3ee)]',
                        )}
                    />
                    {/* Inner mask to create border effect */}
                    <div
                        className={cn(
                            'absolute inset-[2px] rounded-lg',
                            'bg-background z-10',
                        )}
                    />
                </div>
            )}

            {/* The actual button */}
            <div className="relative z-20">{children}</div>

            {/* Initial "Okay" Button to dismiss glow */}
            {showOnboarding && (
                <div className="absolute -top-12 right-0 z-20">
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleDismiss}
                        className="shadow-lg text-xs px-3 py-1 h-auto bg-background/90 backdrop-blur-sm border border-border/50"
                    >
                        Okay
                    </Button>
                </div>
            )}

            {/* Tooltip after dismissal */}
            {showTooltip && (
                <div
                    className={cn(
                        'absolute -top-24 right-0 z-20 w-56',
                        'bg-background/95 backdrop-blur-md rounded-lg shadow-2xl',
                        'border border-border/60 p-3',
                        'animate-in fade-in-0 slide-in-from-bottom-2 duration-300',
                    )}
                >
                    <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                        {ONBOARDING_MESSAGE}
                    </p>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleTooltipClose}
                        className="w-full h-7 text-xs"
                    >
                        Got it
                    </Button>
                </div>
            )}
        </div>
    );
}
