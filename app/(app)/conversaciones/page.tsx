import { ChatsCircle } from "@phosphor-icons/react/dist/ssr";

export default function ConversacionesEmptyPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-muted">
      <ChatsCircle size={48} weight="duotone" />
      <p className="mt-3 text-sm">Selecciona una conversación</p>
    </div>
  );
}
