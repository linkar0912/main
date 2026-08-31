export function ChannelReviewItem({ provider, connectionName }: { provider: "INSTAGRAM" | "FACEBOOK"; connectionName?: string }) {
  return provider === "FACEBOOK"
    ? <li>Facebook · Page comments · {connectionName ?? "Select a Page"}</li>
    : <li>Instagram · Comments and messaging</li>;
}
