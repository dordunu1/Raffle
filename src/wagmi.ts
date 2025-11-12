import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'FHE Draw Lots',
  projectId: import.meta.env.VITE_REOWN_PROJECT_ID || 'ed1deffe285a3c80426c7502b6b773dd',
  chains: [sepolia],
  ssr: false,
});
