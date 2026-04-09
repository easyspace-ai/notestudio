"use client";

import { SparklesIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemTitle,
  ItemContent,
  ItemDescription,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/core/i18n/hooks";
import {
  useDeleteSkill,
  useEnableSkill,
  useRollbackSkill,
  useSkillHistory,
  useSkills,
  useUpdateSkillContent,
} from "@/core/skills/hooks";
import type { Skill } from "@/core/skills/type";
import { env } from "@/env";
import { toast } from "sonner";

import { SettingsSection } from "./settings-section";

export function SkillSettingsPage({ onClose }: { onClose?: () => void } = {}) {
  const { t } = useI18n();
  const { skills, isLoading, error } = useSkills();
  return (
    <SettingsSection
      title={t.settings.skills.title}
      description={t.settings.skills.description}
    >
      {isLoading ? (
        <div className="text-muted-foreground text-sm">{t.common.loading}</div>
      ) : error ? (
        <div>Error: {error.message}</div>
      ) : (
        <SkillSettingsList skills={skills} onClose={onClose} />
      )}
    </SettingsSection>
  );
}

function SkillSettingsList({
  skills,
  onClose,
}: {
  skills: Skill[];
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>("public");
  const { mutate: enableSkill } = useEnableSkill();
  const { mutateAsync: updateContent } = useUpdateSkillContent();
  const { mutateAsync: rollback } = useRollbackSkill();
  const { mutateAsync: removeSkill } = useDeleteSkill();
  const filteredSkills = useMemo(
    () => skills.filter((skill) => skill.category === filter),
    [skills, filter],
  );
  const handleCreateSkill = () => {
    onClose?.();
    navigate("/workspace/chats/new?mode=skill");
  };
  return (
    <div className="flex w-full flex-col gap-4">
      <header className="flex justify-between">
        <div className="flex gap-2">
          <Tabs defaultValue="public" onValueChange={setFilter}>
            <TabsList variant="line">
              <TabsTrigger value="public">{t.common.public}</TabsTrigger>
              <TabsTrigger value="custom">{t.common.custom}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div>
          <Button size="sm" onClick={handleCreateSkill}>
            <SparklesIcon className="size-4" />
            {t.settings.skills.createSkill}
          </Button>
        </div>
      </header>
      {filteredSkills.length === 0 && (
        <EmptySkill onCreateSkill={handleCreateSkill} />
      )}
      {filteredSkills.length > 0 &&
        filteredSkills.map((skill) => (
          <Item className="w-full" variant="outline" key={skill.name}>
            <ItemContent>
              <ItemTitle>
                <div className="flex items-center gap-2">{skill.name}</div>
              </ItemTitle>
              <ItemDescription className="line-clamp-4">
                {skill.description}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              {skill.category === "custom" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const content = window.prompt("输入新的 SKILL.md 内容");
                    if (!content) return;
                    try {
                      await updateContent({ skillName: skill.name, content });
                      toast.success("Skill 内容已更新");
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : "更新 Skill 内容失败",
                      );
                    }
                  }}
                >
                  编辑
                </Button>
              ) : null}
              {skill.category === "custom" ? (
                <SkillHistoryButton
                  skillName={skill.name}
                  onRollback={async (version) => {
                    try {
                      await rollback({ skillName: skill.name, version });
                      toast.success("Skill 已回滚");
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : "Skill 回滚失败",
                      );
                    }
                  }}
                />
              ) : null}
              {skill.category === "custom" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (!window.confirm(`确认删除 ${skill.name} ?`)) return;
                    try {
                      await removeSkill({ skillName: skill.name });
                      toast.success("Skill 已删除");
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : "Skill 删除失败",
                      );
                    }
                  }}
                >
                  删除
                </Button>
              ) : null}
              <Switch
                checked={skill.enabled}
                disabled={env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true"}
                onCheckedChange={(checked) =>
                  enableSkill({ skillName: skill.name, enabled: checked })
                }
              />
            </ItemActions>
          </Item>
        ))}
    </div>
  );
}

function SkillHistoryButton({
  skillName,
  onRollback,
}: {
  skillName: string;
  onRollback: (version?: string) => Promise<void>;
}) {
  const { data: history } = useSkillHistory(skillName, true);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        const latest = Array.isArray(history) && history.length > 0 ? history[0] : undefined;
        const version = window.prompt(
          "输入回滚版本（留空=最近版本）",
          typeof latest?.version === "string" ? latest.version : "",
        );
        void onRollback(version?.trim() || undefined);
      }}
    >
      历史/回滚
    </Button>
  );
}

function EmptySkill({ onCreateSkill }: { onCreateSkill: () => void }) {
  const { t } = useI18n();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SparklesIcon />
        </EmptyMedia>
        <EmptyTitle>{t.settings.skills.emptyTitle}</EmptyTitle>
        <EmptyDescription>
          {t.settings.skills.emptyDescription}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onCreateSkill}>{t.settings.skills.emptyButton}</Button>
      </EmptyContent>
    </Empty>
  );
}
