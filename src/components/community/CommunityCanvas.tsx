"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function CommunityCanvas() {
  return (
    <section
      id="community-canvas"
      data-community="true"
      className="flex-1 px-4 py-8"
      aria-label="Community-built area"
    >
      <div className="mx-auto max-w-3xl">
        <Card className="border-dashed">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Community zone</Badge>
              <CardTitle className="text-base">Nothing here yet</CardTitle>
            </div>
            <CardDescription>
              The first visitor starts from this empty canvas. Use the chat agent to describe a
              layout, theme, or animation — including how the portfolio facts above should look.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Future contributions will render here with{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">data-contribution-id</code>{" "}
              attributes so visitors can hover to see who built what.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
