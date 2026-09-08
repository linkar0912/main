export type DeploymentHygieneFinding = {
  path: string;
  line: number;
  message: "retired deployment artifact" | "retired deployment reference";
};

export function findRetiredDeploymentArtifacts(
  root: string,
  relativePaths: string[],
): Promise<DeploymentHygieneFinding[]>;
