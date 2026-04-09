import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { chatclawApi } from "@/api/chatclaw";

export function useProjectSession(projectId: string, enabled: boolean) {
  const qc = useQueryClient();
  const session = useQuery({
    queryKey: ["project-session", projectId],
    queryFn: () => chatclawApi.projects.session.get(projectId),
    enabled,
  });

  const patchSession = useMutation({
    mutationFn: (body: {
      agent_id?: number;
      conversation_id?: number;
      thread_id?: string;
      selected_source_ids?: number[];
      pinned_artifact_ids?: number[];
    }) => chatclawApi.projects.session.patch(projectId, body),
    onSuccess: (next) => {
      qc.setQueryData(["project-session", projectId], next);
    },
  });

  return { session, patchSession };
}
