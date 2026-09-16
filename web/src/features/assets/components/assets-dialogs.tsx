import { useAssets } from '../context/assets-context';
import { AssetsActionDialog } from './assets-action-dialog';
import { AssetsDeleteDialog } from './assets-delete-dialog';

export function AssetsDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useAssets();
  return (
    <>
      <AssetsActionDialog key="asset-add" open={open === 'add'} onOpenChange={() => setOpen('add')} />

      {currentRow && (
        <>
          <AssetsActionDialog
            key={`asset-edit-${currentRow.id}`}
            open={open === 'edit'}
            onOpenChange={() => {
              setOpen('edit');
              setTimeout(() => {
                setCurrentRow(null);
              }, 500);
            }}
            currentRow={currentRow}
          />

          <AssetsDeleteDialog
            key={`asset-delete-${currentRow.id}`}
            open={open === 'delete'}
            onOpenChange={() => {
              setOpen('delete');
              setTimeout(() => {
                setCurrentRow(null);
              }, 500);
            }}
            currentRow={currentRow}
          />
        </>
      )}
    </>
  );
}
