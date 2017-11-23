/**
 * External dependencies
 */
import { connect } from 'react-redux';
import 'element-closest';
import { find, reverse } from 'lodash';
/**
 * WordPress dependencies
 */
import { Component } from '@wordpress/element';
import { keycodes, focus } from '@wordpress/utils';

/**
 * Internal dependencies
 */
import {
	computeCaretRect,
	isHorizontalEdge,
	isVerticalEdge,
	placeCaretAtHorizontalEdge,
	placeCaretAtVerticalEdge,
} from '../../utils/dom';
import {
	getBlockUids,
	getMultiSelectedBlocksStartUid,
	getMultiSelectedBlocksEndUid,
	getMultiSelectedBlocks,
	getSelectedBlock,
	isNavigating,
} from '../../selectors';
import { multiSelect, focusBlock, selectBlock, combineRange, setSelection, toggleSelection } from '../../actions';

/**
 * Module Constants
 */
const { UP, DOWN, LEFT, RIGHT, SPACE, ENTER } = keycodes;

class WritingFlow extends Component {
	constructor() {
		super( ...arguments );

		this.onKeyDown = this.onKeyDown.bind( this );
		this.bindContainer = this.bindContainer.bind( this );
		this.clearVerticalRect = this.clearVerticalRect.bind( this );
		this.verticalRect = null;
	}

	bindContainer( ref ) {
		this.container = ref;
	}

	clearVerticalRect() {
		this.verticalRect = null;
	}

	getEditables( target ) {
		const outer = target.closest( '.editor-visual-editor__block-edit' );
		if ( ! outer || target === outer ) {
			return [ target ];
		}

		const elements = outer.querySelectorAll( '[contenteditable="true"]' );
		return [ ...elements ];
	}

	getVisibleTabbables() {
		return focus.tabbable
			.find( this.container )
			.filter( ( node ) => (
				node.nodeName === 'INPUT' ||
				node.nodeName === 'TEXTAREA' ||
				node.contentEditable === 'true' ||
				node.classList.contains( 'editor-visual-editor__block-edit' )
			) );
	}

	getClosestTabbable( target, isReverse ) {
		let focusableNodes = this.getVisibleTabbables();

		if ( isReverse ) {
			focusableNodes = reverse( focusableNodes );
		}

		focusableNodes = focusableNodes.slice( focusableNodes.indexOf( target ) );

		return find( focusableNodes, ( node, i, array ) => {
			if ( node.contains( target ) ) {
				return false;
			}

			const nextNode = array[ i + 1 ];

			// Skip node if it contains a focusable node.
			if ( nextNode && node.contains( nextNode ) ) {
				return false;
			}

			return true;
		} );
	}

	focusBlock( blocks, focusedUid, delta ) {
		console.log( 'focusedUid', focusedUid );
		const lastIndex = blocks.indexOf( focusedUid );
		const nextIndex = Math.max( 0, Math.min( blocks.length - 1, lastIndex + delta ) );
		console.log(' blocks', blocks[nextIndex ]);
		this.props.focusBlock( blocks[ nextIndex ], { } );
	}

	expandSelection( blocks, currentStartUid, currentEndUid, delta ) {
		const lastIndex = blocks.indexOf( currentEndUid );
		const nextIndex = Math.max( 0, Math.min( blocks.length - 1, lastIndex + delta ) );
		this.props.onMultiSelect( currentStartUid, blocks[ nextIndex ] );
	}

	isEditableEdge( moveUp, target ) {
		const editables = this.getEditables( target );
		const index = editables.indexOf( target );
		const edgeIndex = moveUp ? 0 : editables.length - 1;
		return editables.length > 0 && index === edgeIndex;
	}

	onKeyDown( event ) {
		const { selectedBlock, selectionStart, selectionEnd, blocks, hasMultiSelection, focusedBlock } = this.props;

		const { keyCode, target } = event;
		const isUp = keyCode === UP;
		const isDown = keyCode === DOWN;
		const isLeft = keyCode === LEFT;
		const isRight = keyCode === RIGHT;
		const isReverse = isUp || isLeft;
		const isHorizontal = isLeft || isRight;
		const isVertical = isUp || isDown;
		const isNav = isHorizontal || isVertical;
		const isShift = event.shiftKey;

		const isNavEdge = isVertical ? isVerticalEdge : isHorizontalEdge;

		const focusedUid = focusedBlock;

		console.log( 'focusedUid', focusedUid, focusedBlock, this.props.stateDump );

		const wayward = focusedUid !== selectionEnd;

		if ( ! focusedUid ) {
			return;
		}

		if ( ! isVertical ) {
			this.verticalRect = null;
		} else if ( ! this.verticalRect ) {
			this.verticalRect = computeCaretRect( target );
		}

		if ( isNav && isShift && hasMultiSelection ) {
			// Shift key is down and existing block selection
			event.preventDefault();

			// If the focus has shifted away from the ranged selection, spawn another one.
			if ( wayward ) {
				const lastIndex = blocks.indexOf( focusedUid );
				const nextIndex = Math.max( 0, Math.min( blocks.length - 1, lastIndex + ( isReverse ? -1 : +1 ) ) );
				if ( event.ctrlKey ) {
					this.props.combineRange( focusedUid, blocks[ nextIndex ] || focusedUid );
				} else {
					this.props.setSelection( focusedUid, blocks[ nextIndex ] || focusedUid, [ ], null );
				}
			} else {
				this.expandSelection( blocks, selectionStart, selectionEnd, isReverse ? -1 : +1 );
			}
		} else if ( isNav && isShift && this.isEditableEdge( isReverse, target ) && isNavEdge( target, isReverse, true ) ) {
			// Shift key is down, but no existing block selection
			event.preventDefault();
			this.expandSelection( blocks, focusedUid, focusedUid, isReverse ? -1 : +1 );
		} else if ( isNav && ! isShift && this.props.inNavigationMode ) {
			console.log('FOCUS ON CURRENTLY', focusedUid );
			this.focusBlock( blocks, focusedUid, isReverse ? -1 : 1 );
		} else if ( isVertical && isVerticalEdge( target, isReverse, isShift ) ) {
			const closestTabbable = this.getClosestTabbable( target, isReverse );
			placeCaretAtVerticalEdge( closestTabbable, isReverse, this.verticalRect );
			event.preventDefault();
		} else if ( isHorizontal && isHorizontalEdge( target, isReverse, isShift ) ) {
			const closestTabbable = this.getClosestTabbable( target, isReverse );
			placeCaretAtHorizontalEdge( closestTabbable, isReverse );
			event.preventDefault();
		} else if ( hasMultiSelection && keyCode === SPACE ) {
			if ( event.metaKey || event.ctrlKey ) {
				this.props.toggleSelection( focusedUid, focusedUid );
			} else {
				this.props.setSelection( focusedUid, focusedUid, [ ], focusedUid );
			}

			event.preventDefault();
			event.stopPropagation();
		} else if ( hasMultiSelection && keyCode === ENTER ) {
			this.props.selectBlock( focusedUid );
			event.preventDefault();
			event.stopPropagation();
		}
	}

	render() {
		const { children } = this.props;

		// Disable reason: Wrapper itself is non-interactive, but must capture
		// bubbling events from children to determine focus transition intents.
		/* eslint-disable jsx-a11y/no-static-element-interactions */
		return (
			<div
				ref={ this.bindContainer }
				onKeyDown={ this.onKeyDown }
				onMouseDown={ this.clearVerticalRect }
			>
				{ children }
			</div>
		);
		/* eslint-disable jsx-a11y/no-static-element-interactions */
	}
}

export default connect(
	( state ) => ( {
		blocks: getBlockUids( state ),
		selectionStart: getMultiSelectedBlocksStartUid( state ),
		selectionEnd: getMultiSelectedBlocksEndUid( state ),

		// Temporary hack
		focusedBlock: state.blockSelection.focus && state.blockSelection.focus.uid,

		hasMultiSelection: getMultiSelectedBlocks( state ).length > 0,
		inNavigationMode: isNavigating( state ),
		selectedBlock: getSelectedBlock( state ),
		stateDump: state,
	} ),
	( dispatch ) => ( {
		onMultiSelect( start, end ) {
			dispatch( multiSelect( start, end ) );
		},
		selectBlock( uid ) {
			dispatch( selectBlock( uid ) );
		},

		focusBlock( uid, config ) {
			dispatch( focusBlock( uid, config ) );
		},

		toggleSelection( uid, focusUid ) {
			dispatch( toggleSelection( uid, focusUid ) );
		},

		setSelection( start, end, selected, focusUid ) {
			dispatch( setSelection( start, end, selected, focusUid ) );
		},

		combineRange( start, end ) {
			dispatch( combineRange( start, end ) );
		},
	} )
)( WritingFlow );
