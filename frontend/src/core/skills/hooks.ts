import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteSkill,
  enableSkill,
  loadSkillHistory,
  rollbackSkill,
  updateSkillContent,
} from "./api";

import { loadSkills } from ".";

export function useSkills() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["skills"],
    queryFn: () => loadSkills(),
  });
  return { skills: data ?? [], isLoading, error };
}

export function useEnableSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      skillName,
      enabled,
    }: {
      skillName: string;
      enabled: boolean;
    }) => {
      await enableSkill(skillName, enabled);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

export function useSkillHistory(skillName: string, enabled = true) {
  return useQuery({
    queryKey: ["skills", "history", skillName],
    queryFn: () => loadSkillHistory(skillName),
    enabled: enabled && !!skillName,
  });
}

export function useUpdateSkillContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      skillName,
      content,
    }: {
      skillName: string;
      content: string;
    }) => updateSkillContent(skillName, content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

export function useRollbackSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      skillName,
      version,
    }: {
      skillName: string;
      version?: string;
    }) => rollbackSkill(skillName, version),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
      void queryClient.invalidateQueries({
        queryKey: ["skills", "history", variables.skillName],
      });
    },
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ skillName }: { skillName: string }) =>
      deleteSkill(skillName),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
