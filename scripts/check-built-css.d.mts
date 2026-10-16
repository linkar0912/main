export type PrefixOnlyDeclaration = {
  selector: string;
  property: string;
};

export function findPrefixOnlyDeclarations(css: string): PrefixOnlyDeclaration[];
