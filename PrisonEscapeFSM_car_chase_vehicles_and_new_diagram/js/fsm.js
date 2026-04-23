class StateMachine {
    constructor(initialState) {
        this.state = initialState;
        this.previousState = null;
    }

    setState(newState) {
        if (this.state === newState) return;
        this.previousState = this.state;
        this.state = newState;
    }

    getState() {
        return this.state;
    }
}
