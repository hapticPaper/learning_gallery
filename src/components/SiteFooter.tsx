export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200/70 bg-zinc-50 dark:border-zinc-800/70 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:text-zinc-300">
        <p>
          Built for quick iteration: write MDX in <code>content/</code> and drop
          assets in <code>public/</code>.
        </p>
        <p>
          <a
            className="underline underline-offset-4 hover:text-zinc-950 dark:hover:text-zinc-50"
            href="https://github.com/hapticPaper/learning_gallery"
            target="_blank"
            rel="noreferrer"
          >
            Source
          </a>
        </p>
      </div>
    </footer>
  );
}
