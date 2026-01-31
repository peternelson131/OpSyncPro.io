import { useState, useCallback } from 'react';

export function useConfirm() {
  const [state, setState] = useState({ isOpen: false, resolve: null, props: {} });

  const confirm = useCallback((props = {}) => {
    return new Promise((resolve) => {
      setState({ isOpen: true, resolve, props });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state.resolve?.(true);
    setState({ isOpen: false, resolve: null, props: {} });
  }, [state.resolve]);

  const handleCancel = useCallback(() => {
    state.resolve?.(false);
    setState({ isOpen: false, resolve: null, props: {} });
  }, [state.resolve]);

  return {
    isOpen: state.isOpen,
    props: state.props,
    confirm,
    handleConfirm,
    handleCancel,
  };
}
