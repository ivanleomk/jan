import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { localStoregeKey } from '@/constants/localStorage'
import { mockTheads } from '@/mock/data'
import Fuse from 'fuse.js'

type ThreadState = {
  threads: Thread[]
  deletedThreadIds: string[]
  searchIndex: Fuse<Thread> | null
  setThreads: (threads: Thread[]) => void
  fetchThreads: () => Promise<void>
  getFavoriteThreads: () => Thread[]
  getThreadById: (threadId: string) => Thread | undefined
  toggleFavorite: (threadId: string) => void
  deleteThread: (threadId: string) => void
  deleteAllThreads: () => void
  unstarAllThreads: () => void
  getFilteredThreads: (searchTerm: string) => Thread[]
}

const fuseOptions = {
  keys: [
    ['title'],
    {
      name: 'content',
      getFn: (thread: Thread) => {
        // Extract all text values from the thread content
        return thread.content
          .filter((item) => item.text?.value)
          .map((item) => item.text!.value)
          .join('\n') // Join all text values into a single searchable string
      },
    },
  ],
  threshold: 0.2,
  includeMatches: true,
  ignoreLocation: true, // Ignore the location of the match in the string
  useExtendedSearch: true, // Enable extended search
  distance: 20, // Maximum edit distance for fuzzy matching
  tokenize: true, // Tokenize the search pattern and text
  matchAllTokens: true, // Only require some tokens to match, not all
  findAllMatches: true, // Find all matches, not just the first one,
}

export const useThreads = create<ThreadState>()(
  persist(
    (set, get) => ({
      threads: [],
      deletedThreadIds: [],
      searchIndex: null,
      setThreads: (threads) => {
        const newIndex = new Fuse(threads, fuseOptions)
        set({ threads, searchIndex: newIndex })
      },
      toggleFavorite: (threadId) => {
        set((state) => ({
          threads: state.threads.map((thread) =>
            thread.id === threadId
              ? { ...thread, isFavorite: !thread.isFavorite }
              : thread
          ),
        }))
      },
      deleteThread: (threadId) => {
        set((state) => {
          // Filter out the thread to be deleted
          const updatedThreads = state.threads.filter(
            (thread) => thread.id !== threadId
          )

          // Create a new search index with the updated threads
          const newIndex = new Fuse(updatedThreads, fuseOptions)

          return {
            threads: updatedThreads,
            deletedThreadIds: [...state.deletedThreadIds, threadId],
            searchIndex: newIndex,
          }
        })
      },
      deleteAllThreads: () => {
        set((state) => {
          const allThreadIds = state.threads.map((thread) => thread.id)
          return {
            threads: [],
            deletedThreadIds: [...state.deletedThreadIds, ...allThreadIds],
            searchIndex: null,
          }
        })
      },
      unstarAllThreads: () => {
        set((state) => ({
          threads: state.threads.map((thread) => ({
            ...thread,
            isFavorite: false,
          })),
        }))
      },
      getFilteredThreads: (searchTerm: string) => {
        const { threads, searchIndex } = get()

        // If no search term, return all threads
        if (!searchTerm) {
          return threads
        }

        // Get current search index or create a new one if it doesn't exist
        const currentIndex =
          searchIndex ||
          (() => {
            const newIndex = new Fuse(threads, fuseOptions)
            // Update the store with the new index
            set({ searchIndex: newIndex })
            return newIndex
          })()

        // Use the index to search and return matching threads
        const searchResults = currentIndex.search(searchTerm)
        const validIds = searchResults.map((result) => result.item.id)
        return get().threads.filter((thread) => validIds.includes(thread.id))
      },
      getFavoriteThreads: () => {
        return get().threads.filter((thread) => thread.isFavorite)
      },
      getThreadById: (threadId: string) => {
        return get().threads.find((thread) => thread.id === threadId)
      },
      fetchThreads: async () => {
        const response = await new Promise<Thread[]>((resolve) =>
          setTimeout(() => resolve(mockTheads as Thread[]), 0)
        )

        set((state) => {
          // Filter out deleted threads from the response
          const filteredResponse = response.filter(
            (thread) => !state.deletedThreadIds.includes(thread.id)
          )

          const localIds = state.threads.map((t) => t.id)
          const responseIds = filteredResponse.map((t) => t.id)

          const isSame =
            localIds.length === responseIds.length &&
            localIds.every((id) => responseIds.includes(id))

          if (isSame) {
            return { threads: state.threads, searchIndex: state.searchIndex }
          }

          const existingIds = new Set(localIds)
          const newThreads = filteredResponse.filter(
            (t) => !existingIds.has(t.id)
          )
          const updatedThreads = [...state.threads, ...newThreads]
          const newIndex = new Fuse(updatedThreads, fuseOptions)
          return {
            threads: updatedThreads,
            searchIndex: newIndex,
          }
        })
      },
    }),
    {
      name: localStoregeKey.threads,
      storage: createJSONStorage(() => localStorage),
      partialize: (state: ThreadState) => ({
        threads: state.threads,
        deletedThreadIds: state.deletedThreadIds,
      }),
    }
  )
)
