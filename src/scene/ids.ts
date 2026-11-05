import { nanoid } from "nanoid";

export const newId = (): string => nanoid(12);
export const newNonce = (): number => Math.floor(Math.random() * 2 ** 31);
export const newSeed = newNonce;
