export interface MockUser {
  id: string;
  name: string;
  email: string;
  image: string;
}

export const mockUsers: MockUser[] = [
  {
    id: "mock-alice",
    name: "Alice",
    email: "alice@splitvibe.dev",
    image: "https://api.dicebear.com/9.x/thumbs/svg?seed=Alice",
  },
  {
    id: "mock-bob",
    name: "Bob",
    email: "bob@splitvibe.dev",
    image: "https://api.dicebear.com/9.x/thumbs/svg?seed=Bob",
  },
  {
    id: "mock-carol",
    name: "Carol",
    email: "carol@splitvibe.dev",
    image: "https://api.dicebear.com/9.x/thumbs/svg?seed=Carol",
  },
];
