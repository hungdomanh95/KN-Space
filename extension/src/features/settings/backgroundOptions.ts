import type { BackgroundKey } from '../../types';

export interface BackgroundOption {
  key: BackgroundKey;
  title: string;
  css: string | null; // null = plain (không set background trên body)
}

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { key: 'plain', title: 'Nền trơn (không ảnh)', css: null },
  { key: 'g1', title: 'Nền gradient xanh lá', css: 'linear-gradient(135deg,#a8e6cf,#56c596)' },
  { key: 'g2', title: 'Nền gradient xanh dương', css: 'linear-gradient(135deg,#a1c4fd,#c2e9fb)' },
  { key: 'g3', title: 'Nền gradient hồng tím', css: 'linear-gradient(135deg,#fbc2eb,#a6c1ee)' },
  { key: 'g4', title: 'Nền gradient cam đỏ', css: 'linear-gradient(135deg,#fdcb82,#fc8181)' },
  { key: 'g5', title: 'Nền gradient xanh ngọc', css: 'linear-gradient(135deg,#84fab0,#8fd3f4)' },
];

export const HEADER_TINTS_LIGHT: Record<string, string> = {
  g1: '#eafaf1', g2: '#eaf3ff', g3: '#fbeef9', g4: '#fff1ea', g5: '#eafffa',
};

export const HEADER_TINTS_DARK: Record<string, string> = {
  g1: '#1a2620', g2: '#19222e', g3: '#241c28', g4: '#291f1a', g5: '#172625',
};
