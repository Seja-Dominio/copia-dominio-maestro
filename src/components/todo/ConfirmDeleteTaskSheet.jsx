import { Sheet, SheetContent, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export default function ConfirmDeleteTaskSheet({ isOpen, onClose, onConfirm, taskTitle }) {
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="w-full max-w-full rounded-t-2xl">
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-foreground">Remover tarefa?</h3>
            <SheetDescription className="text-sm text-muted-foreground mt-1">
              {taskTitle}
            </SheetDescription>
          </div>
          
          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              className="flex-1 gap-2"
              onClick={onConfirm}
            >
              <Trash2 className="w-4 h-4" />
              Excluir
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}