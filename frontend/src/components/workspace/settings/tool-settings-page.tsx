"use client";

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { chatclawApi } from "@/api/chatclaw";
import { useI18n } from "@/core/i18n/hooks";
import { useMCPConfig, useEnableMCPServer } from "@/core/mcp/hooks";
import type { MCPServerConfig } from "@/core/mcp/types";
import { env } from "@/env";

import { SettingsSection } from "./settings-section";

export function ToolSettingsPage() {
  const { t } = useI18n();
  const { config, isLoading, error } = useMCPConfig();
  return (
    <SettingsSection
      title={t.settings.tools.title}
      description={t.settings.tools.description}
    >
      {isLoading ? (
        <div className="text-muted-foreground text-sm">{t.common.loading}</div>
      ) : error ? (
        <div>Error: {error.message}</div>
      ) : (
        <>
          {config && <MCPServerList servers={config.mcp_servers} />}
          <ChannelsControl />
        </>
      )}
    </SettingsSection>
  );
}

function ChannelsControl() {
  const qc = useQueryClient();
  const channels = useQuery({
    queryKey: ["channels"],
    queryFn: () => chatclawApi.channels.list(),
  });
  const serviceStart = useMutation({
    mutationFn: () => chatclawApi.channels.start(),
    onSuccess: () => {
      toast.success("Channels service started");
      void qc.invalidateQueries({ queryKey: ["channels"] });
    },
  });
  const serviceStop = useMutation({
    mutationFn: () => chatclawApi.channels.stop(),
    onSuccess: () => {
      toast.success("Channels service stopped");
      void qc.invalidateQueries({ queryKey: ["channels"] });
    },
  });
  const channelAction = useMutation({
    mutationFn: async ({
      name,
      action,
    }: {
      name: string;
      action: "start" | "stop" | "restart";
    }) => {
      if (action === "start") return chatclawApi.channels.startOne(name);
      if (action === "stop") return chatclawApi.channels.stopOne(name);
      return chatclawApi.channels.restartOne(name);
    },
    onSuccess: () => {
      toast.success("Channel action submitted");
      void qc.invalidateQueries({ queryKey: ["channels"] });
    },
  });

  const rows = Array.isArray(channels.data) ? channels.data : [];
  return (
    <div className="mt-4 space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Channels</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => serviceStart.mutate()}>
            Start Service
          </Button>
          <Button size="sm" variant="outline" onClick={() => serviceStop.mutate()}>
            Stop Service
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((row, idx) => {
          const name =
            typeof (row as Record<string, unknown>)?.name === "string"
              ? ((row as Record<string, unknown>).name as string)
              : `channel-${idx + 1}`;
          return (
            <div key={name} className="flex items-center justify-between rounded border px-2 py-1.5 text-sm">
              <span>{name}</span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => channelAction.mutate({ name, action: "start" })}
                >
                  Start
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => channelAction.mutate({ name, action: "stop" })}
                >
                  Stop
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => channelAction.mutate({ name, action: "restart" })}
                >
                  Restart
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MCPServerList({
  servers,
}: {
  servers: Record<string, MCPServerConfig>;
}) {
  const { mutate: enableMCPServer } = useEnableMCPServer();
  return (
    <div className="flex w-full flex-col gap-4">
      {Object.entries(servers).map(([name, config]) => (
        <Item className="w-full" variant="outline" key={name}>
          <ItemContent>
            <ItemTitle>
              <div className="flex items-center gap-2">
                <div>{name}</div>
              </div>
            </ItemTitle>
            <ItemDescription className="line-clamp-4">
              {config.description}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Switch
              checked={config.enabled}
              disabled={env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true"}
              onCheckedChange={(checked) =>
                enableMCPServer({ serverName: name, enabled: checked })
              }
            />
          </ItemActions>
        </Item>
      ))}
    </div>
  );
}
