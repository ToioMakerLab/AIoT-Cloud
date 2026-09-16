import React, { useState } from 'react';
import useDialogState from '@/hooks/use-dialog-state';
import type { Asset } from '../data/schema';

type AssetsDialogType = 'add' | 'edit' | 'delete';

interface AssetsContextType {
  open: AssetsDialogType | null;
  setOpen: (str: AssetsDialogType | null) => void;
  currentRow: Asset | null;
  setCurrentRow: React.Dispatch<React.SetStateAction<Asset | null>>;
}

const AssetsContext = React.createContext<AssetsContextType | null>(null);

interface Props {
  children: React.ReactNode;
}

export default function AssetsProvider({ children }: Props) {
  const [open, setOpen] = useDialogState<AssetsDialogType>(null);
  const [currentRow, setCurrentRow] = useState<Asset | null>(null);

  return <AssetsContext.Provider value={{ open, setOpen, currentRow, setCurrentRow }}>{children}</AssetsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAssets = () => {
  const assetsContext = React.useContext(AssetsContext);

  if (!assetsContext) {
    throw new Error('useAssets has to be used within <AssetsContext>');
  }

  return assetsContext;
};
