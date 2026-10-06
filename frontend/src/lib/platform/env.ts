// True inside the Wails desktop shell, where Go bindings exist on window.go.
// False in a plain browser: the hosted build, or `npm run dev` without Wails.
export const inWails = typeof window !== 'undefined' && 'go' in window;
