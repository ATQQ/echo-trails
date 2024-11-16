declare module '*.toml' {
  const content: { [key: string]: string };
  export default content;
}
