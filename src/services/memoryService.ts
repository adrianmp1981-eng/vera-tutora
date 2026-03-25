import { UserMemory } from '../types';

const MEMORY_KEY = 'vera_user_memory';

export const getMemory = (): UserMemory | null => {
  const saved = localStorage.getItem(MEMORY_KEY);
  return saved ? JSON.parse(saved) : null;
};

export const saveMemory = (memory: UserMemory): void => {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
};

export const updateMemory = (updates: Partial<UserMemory>): void => {
  const current = getMemory();
  if (current) {
    saveMemory({ ...current, ...updates });
  }
};

export const clearMemory = (): void => {
  localStorage.removeItem(MEMORY_KEY);
};

export const hasMemory = (): boolean => {
  return localStorage.getItem(MEMORY_KEY) !== null;
};
