// `@vereino/ui/emails`: the e-mail shell (foundation III P-31). Plain `.ts` files only, so the platform's Node worker
// and CLI processes can load them (Node strips types but cannot load `.tsx`); the dispatch worker imports this entry,
// never the package root, which also carries the `.tsx` member components.
export * from '#src/emails/EmailLayout'
export * from '#src/emails/expand-email-tree'
