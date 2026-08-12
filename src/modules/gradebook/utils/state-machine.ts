import { AppError } from "@/lib/errors";

export function requireStateTransition<TState extends string>(input: {
  current: TState;
  next: TState;
  transitions: Readonly<Record<TState, readonly TState[]>>;
  errorCode: string;
}) {
  if (!input.transitions[input.current]?.includes(input.next)) {
    throw new AppError(input.errorCode, input.errorCode, 409);
  }
}
