'use client';

import { PropsWithChildren, useEffect, useState, type FC } from 'react';
import Image from 'next/image';
import { XIcon, FileText, PaperclipIcon } from 'lucide-react';
import {
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAssistantState,
  useAssistantApi,
} from '@assistant-ui/react';
import { useShallow } from 'zustand/shallow';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogTrigger,
} from '@/components/ui/dialog';

import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button';
import { cn } from '@/lib/utils';

const useFileSrc = (file: File | undefined) => {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!file) {
      setSrc(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return src;
};

const useAttachmentSrc = () => {
  const { file, src } = useAssistantState(
    useShallow(({ attachment }): { file?: File; src?: string } => {
      if (attachment.type !== 'image') return {};
      if (attachment.file) return { file: attachment.file };
      const src = attachment.content?.filter((c) => c.type === 'image')[0]
        ?.image;
      if (!src) return {};
      return { src };
    }),
  );

  return useFileSrc(file) ?? src;
};

const AttachmentPreviewDialog: FC<PropsWithChildren> = ({ children }) => {
  const src = useAttachmentSrc();
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="p-0 border-none bg-transparent shadow-none max-w-[90vw] max-h-[90vh] flex items-center justify-center outline-none">
        <DialogTitle className="sr-only">Image Preview</DialogTitle>
        <Image
          src={src ?? ''}
          alt="Preview"
          width={0}
          height={0}
          sizes="90vw"
          className={
            isLoaded
              ? 'aui-attachment-preview-image-loaded block h-auto max-h-[80vh] w-auto max-w-full object-contain'
              : 'aui-attachment-preview-image-loading hidden'
          }
          onLoadingComplete={() => setIsLoaded(true)}
          priority={false}
          unoptimized
        />
        {!isLoaded && <span className="text-white">Loading...</span>}
      </DialogContent>
    </Dialog>
  );
};

const AttachmentThumb: FC = () => {
  const isImage = useAssistantState(
    ({ attachment }) => attachment.type === 'image',
  );
  const src = useAttachmentSrc();

  if (isImage && src) {
    return (
      <Image
        src={src}
        alt="Attachment thumbnail"
        fill
        className="aui-attachment-thumb-image object-cover"
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        priority={false}
        unoptimized
      />
    );
  }

  return (
    <div className="aui-attachment-thumb-fallback flex size-full items-center justify-center bg-muted text-muted-foreground">
      <FileText className="size-6" />
    </div>
  );
};

const AttachmentUI: FC = () => {
  const api = useAssistantApi();
  const isComposer = api.attachment.source === 'composer';

  const isImage = useAssistantState(
    ({ attachment }) => attachment.type === 'image',
  );

  return (
    <Tooltip>
      <AttachmentPrimitive.Root
        className={cn(
          'aui-attachment-root relative',
          isImage &&
            'aui-attachment-root-composer only:[&>#attachment-tile]:size-24',
        )}
      >
        <AttachmentPreviewDialog>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'aui-attachment-tile size-14 cursor-pointer overflow-hidden rounded-[14px] border bg-muted transition-opacity hover:opacity-75',
                isComposer &&
                  'aui-attachment-tile-composer border-foreground/20',
              )}
              role="button"
              id="attachment-tile"
            >
              <AttachmentThumb />
              {isComposer && <AttachmentRemove />}
            </div>
          </TooltipTrigger>
        </AttachmentPreviewDialog>
      </AttachmentPrimitive.Root>
      <TooltipContent side="top">
        <AttachmentPrimitive.Name />
      </TooltipContent>
    </Tooltip>
  );
};

const AttachmentRemove: FC = () => {
  return (
    <AttachmentPrimitive.Remove asChild>
      <TooltipIconButton
        tooltip="Remove file"
        className="aui-attachment-tile-remove absolute top-1.5 right-1.5 size-3.5 rounded-full bg-white text-muted-foreground opacity-100 shadow-sm hover:bg-white! [&_svg]:text-black hover:[&_svg]:text-destructive"
        side="top"
      >
        <XIcon className="aui-attachment-remove-icon size-3 dark:stroke-[2.5px]" />
      </TooltipIconButton>
    </AttachmentPrimitive.Remove>
  );
};

export const UserMessageAttachments: FC = () => {
  return (
    <div className="aui-user-message-attachments-end col-span-full col-start-1 row-start-1 flex w-full flex-row justify-end gap-2">
      <MessagePrimitive.Attachments components={{ Attachment: AttachmentUI }} />
    </div>
  );
};

export const ComposerAttachments: FC = () => {
  return (
    <div className="aui-composer-attachments mb-2 flex w-full flex-row items-center gap-2 overflow-x-auto px-1.5 pt-0.5 pb-1 empty:hidden">
      <ComposerPrimitive.Attachments
        components={{ Attachment: AttachmentUI }}
      />
    </div>
  );
};

export const ComposerAddAttachment: FC<{ className?: string }> = ({
  className,
}) => {
  return (
    <ComposerPrimitive.AddAttachment asChild>
      <TooltipIconButton
        tooltip="Attach file"
        variant="ghost"
        size="icon"
        className={className}
      >
        <PaperclipIcon className="size-4" />
      </TooltipIconButton>
    </ComposerPrimitive.AddAttachment>
  );
};
